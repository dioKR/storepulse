import { asArray, asString } from "../connectors/defensive.js";
import type { Enricher } from "../enricher.js";
import type { AppStatus, ChannelStatus, EasBuildInfo, Platform } from "../types.js";

/**
 * EAS enricher — attaches "which EAS build is this store version?" info to
 * the board (issue: link store versions to Expo builds).
 *
 * All query shapes follow expo/eas-cli, the reference client for this API:
 * - ViewBuildsOnApp + BuildFilter: packages/eas-cli/src/graphql/queries/BuildQuery.ts
 * - Build fields: packages/eas-cli/src/graphql/types/Build.ts (BuildFragment)
 * - nested submissions: BuildWithSubmissionsFragment (same file) +
 *   packages/eas-cli/src/graphql/types/Submission.ts (SubmissionFragment)
 * - CurrentUser: packages/eas-cli/src/graphql/queries/UserQuery.ts
 * - AppByIdQuery: packages/eas-cli/src/graphql/queries/AppQuery.ts
 * Endpoint + bearer header: packages/eas-cli/src/api.ts,
 * src/commandUtils/context/contextUtils/createGraphqlClient.ts.
 */

export const EAS_GRAPHQL_ENDPOINT = "https://api.expo.dev/graphql";

/** How many recent finished builds to consider per project × platform. */
const BUILD_PAGE_SIZE = 50;

export interface EasCredentials {
  /** Personal or robot access token — expo.dev → Settings → Access tokens */
  token: string;
}

/** Non-2xx response or GraphQL-level errors from the EAS API. */
export class EasGraphqlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EasGraphqlError";
  }
}

/** Minimal GraphQL POST — throws EasGraphqlError on HTTP or GraphQL errors. */
async function easGraphqlRequest(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(EAS_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new EasGraphqlError(`EAS GraphQL HTTP ${res.status}`, res.status);
  }
  const payload = (await res.json()) as {
    data?: unknown;
    errors?: { message?: string }[];
  } | null;
  const errors = asArray(payload?.errors) as { message?: string }[];
  if (errors.length > 0) {
    throw new EasGraphqlError(
      errors.map((e) => asString(e?.message) ?? "unknown error").join("; "),
    );
  }
  return payload?.data;
}

/** eas-cli BuildQuery.viewBuildsOnAppAsync, trimmed to the fields we consume. */
const VIEW_BUILDS_QUERY = `
  query ViewBuildsOnApp($appId: String!, $offset: Int!, $limit: Int!, $filter: BuildFilter) {
    app {
      byId(appId: $appId) {
        id
        builds(offset: $offset, limit: $limit, filter: $filter) {
          id
          status
          platform
          buildProfile
          appVersion
          appBuildVersion
          appIdentifier
          gitCommitHash
          completedAt
          submissions {
            id
            status
            createdAt
          }
        }
      }
    }
  }
`;

/** eas-cli UserQuery.currentUserAsync, trimmed — doctor's token-validity probe. */
const CURRENT_USER_QUERY = `
  query CurrentUser {
    meActor {
      __typename
      id
      ... on UserActor {
        username
      }
      ... on Robot {
        firstName
      }
    }
  }
`;

/** eas-cli AppQuery.byIdAsync, trimmed — doctor's per-project access probe. */
const APP_BY_ID_QUERY = `
  query AppByIdQuery($appId: String!) {
    app {
      byId(appId: $appId) {
        id
        name
        slug
        ownerAccount {
          id
          name
        }
      }
    }
  }
`;

export interface EasViewer {
  id?: string;
  /** "User" | "SSOUser" | "Robot" | … */
  typename?: string;
  /** username (users) or robot first name — for display only */
  name?: string;
}

/** Who does this token act as? Throws EasGraphqlError when rejected. */
export async function fetchEasViewer(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EasViewer> {
  const data = (await easGraphqlRequest(token, CURRENT_USER_QUERY, {}, fetchImpl)) as any;
  const actor = data?.meActor;
  if (!actor) throw new EasGraphqlError("EAS returned no viewer (meActor is empty)");
  const id = asString(actor?.id);
  const typename = asString(actor?.__typename);
  const name = asString(actor?.username) ?? asString(actor?.firstName);
  return {
    ...(id !== undefined && { id }),
    ...(typename !== undefined && { typename }),
    ...(name !== undefined && { name }),
  };
}

export interface EasProject {
  id?: string;
  name?: string;
  /** "@account/slug" when both are present */
  fullName?: string;
}

/** Can this token see the given EAS project? Throws EasGraphqlError when not. */
export async function fetchEasProject(
  token: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EasProject> {
  const data = (await easGraphqlRequest(
    token,
    APP_BY_ID_QUERY,
    { appId: projectId },
    fetchImpl,
  )) as any;
  const app = data?.app?.byId;
  if (!app) throw new EasGraphqlError(`EAS project "${projectId}" not found in the response`);
  const id = asString(app?.id);
  const name = asString(app?.name);
  const slug = asString(app?.slug);
  const owner = asString(app?.ownerAccount?.name);
  return {
    ...(id !== undefined && { id }),
    ...(name !== undefined && { name }),
    ...(slug !== undefined && owner !== undefined && { fullName: `@${owner}/${slug}` }),
  };
}

/** One parsed EAS build — internal shape used for matching. */
interface EasBuild {
  buildId?: string;
  appVersion?: string;
  appBuildVersion?: string;
  appIdentifier?: string;
  profile?: string;
  commit?: string;
  completedAt?: string;
  submissionStatus?: string;
}

function parseBuild(raw: any): EasBuild {
  // Latest submission wins — sort by createdAt descending, missing dates last.
  const submissions = (asArray(raw?.submissions) as any[])
    .map((s) => ({ status: asString(s?.status), createdAt: asString(s?.createdAt) ?? "" }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const buildId = asString(raw?.id);
  const appVersion = asString(raw?.appVersion);
  const appBuildVersion = asString(raw?.appBuildVersion);
  const appIdentifier = asString(raw?.appIdentifier);
  const profile = asString(raw?.buildProfile);
  const commit = asString(raw?.gitCommitHash);
  const completedAt = asString(raw?.completedAt);
  const submissionStatus = submissions[0]?.status;
  return {
    ...(buildId !== undefined && { buildId }),
    ...(appVersion !== undefined && { appVersion }),
    ...(appBuildVersion !== undefined && { appBuildVersion }),
    ...(appIdentifier !== undefined && { appIdentifier }),
    ...(profile !== undefined && { profile }),
    ...(commit !== undefined && { commit }),
    ...(completedAt !== undefined && { completedAt }),
    ...(submissionStatus !== undefined && { submissionStatus }),
  };
}

/**
 * Restrict a project's builds to the ones that belong to this store app.
 * One EAS project can build several variants of the same platform (prod +
 * dev bundle/package IDs); version/build numbers often coincide across them,
 * so matching against the whole list could attach the wrong variant's build.
 * With an expected identifier (Android: storeId is the package name; iOS:
 * opt-in `easAppIdentifier`), only exact-identifier builds survive. Without
 * one, builds are used only when they all carry a single identifier —
 * multiple variants with no way to tell them apart skip enrichment entirely.
 */
function scopeBuilds(builds: EasBuild[], expected: string | undefined): EasBuild[] {
  if (expected !== undefined) {
    return builds.filter((b) => b.appIdentifier === expected);
  }
  const identifiers = new Set(builds.map((b) => b.appIdentifier).filter((v) => v !== undefined));
  return identifiers.size <= 1 ? builds : [];
}

/**
 * Among same-version builds without a store build number to disambiguate,
 * never guess by recency alone: prefer the binary the store actually received
 * (a FINISHED submission, then any submission attempt), and otherwise match
 * only when a single candidate exists. Retried or preview builds of the same
 * version therefore stay unmatched instead of masquerading as the live one.
 */
function pickBySubmission(candidates: EasBuild[]): EasBuild | undefined {
  const delivered = candidates.filter((b) => b.submissionStatus === "FINISHED");
  if (delivered.length > 0) return delivered[0];
  const attempted = candidates.filter((b) => b.submissionStatus !== undefined);
  if (attempted.length > 0) return attempted[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Match a channel entry to an EAS build:
 * - marketing version must equal `appVersion`;
 * - when the channel knows its build number (iOS build number / Android
 *   versionCode), it must equal `appBuildVersion` too;
 * - without a build number, the submission relationship decides
 *   (see pickBySubmission) — recency alone never does.
 * When no build carries the channel's version string (custom Play release
 * names put an arbitrary name in `version`), the build number alone decides —
 * but only if it identifies exactly one build: Android versionCodes are unique
 * per app, while reused iOS build numbers stay ambiguous and are skipped.
 * No match → undefined, and the channel stays exactly as the store reported it.
 */
export function matchEasBuild(
  channel: Pick<ChannelStatus, "version" | "build">,
  builds: EasBuild[],
): EasBuild | undefined {
  const sameVersion =
    channel.version == null ? [] : builds.filter((b) => b.appVersion === channel.version);
  if (sameVersion.length > 0) {
    if (channel.build != null) {
      return sameVersion.find((b) => b.appBuildVersion === channel.build);
    }
    return pickBySubmission(sameVersion);
  }
  if (channel.build != null) {
    const sameBuild = builds.filter((b) => b.appBuildVersion === channel.build);
    if (sameBuild.length === 1) return sameBuild[0];
  }
  return undefined;
}

function withEasInfo(channel: ChannelStatus, builds: EasBuild[]): ChannelStatus {
  const match = matchEasBuild(channel, builds);
  if (!match) return channel;
  const eas: EasBuildInfo = {
    ...(match.profile !== undefined && { profile: match.profile }),
    ...(match.commit !== undefined && { commit: match.commit }),
    ...(match.buildId !== undefined && { buildId: match.buildId }),
    ...(match.completedAt !== undefined && { completedAt: match.completedAt }),
    ...(match.submissionStatus !== undefined && { submissionStatus: match.submissionStatus }),
  };
  if (Object.keys(eas).length === 0) return channel;
  return { ...channel, eas };
}

/**
 * Attaches EAS build/submission info to every channel entry whose target has
 * an `easProjectId`. One builds query per project × platform actually in use;
 * any failed query (bad projectId, network, permissions) silently leaves the
 * affected targets un-enriched — the board itself never dies on EAS problems.
 */
export class EasEnricher implements Enricher {
  readonly id = "eas";

  constructor(
    private readonly creds: EasCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async enrich(statuses: AppStatus[]): Promise<AppStatus[]> {
    const wanted = new Map<string, { projectId: string; platform: Platform }>();
    for (const status of statuses) {
      const projectId = status.target.easProjectId;
      if (!projectId || status.error) continue;
      const key = `${projectId} ${status.target.platform}`;
      wanted.set(key, { projectId, platform: status.target.platform });
    }

    const buildsByKey = new Map<string, EasBuild[]>();
    await Promise.all(
      [...wanted.entries()].map(async ([key, { projectId, platform }]) => {
        try {
          buildsByKey.set(key, await this.fetchFinishedBuilds(projectId, platform));
        } catch {
          // This project × platform is skipped; everything else still enriches.
        }
      }),
    );

    return statuses.map((status) => {
      const projectId = status.target.easProjectId;
      if (!projectId) return status;
      const builds = buildsByKey.get(`${projectId} ${status.target.platform}`);
      if (!builds || builds.length === 0) return status;
      const expected =
        status.target.easAppIdentifier ??
        (status.target.platform === "android" ? status.target.storeId : undefined);
      const scoped = scopeBuilds(builds, expected);
      if (scoped.length === 0) return status;
      return { ...status, channels: status.channels.map((c) => withEasInfo(c, scoped)) };
    });
  }

  /** Recent FINISHED builds for one project on one platform, newest first. */
  private async fetchFinishedBuilds(projectId: string, platform: Platform): Promise<EasBuild[]> {
    const data = (await easGraphqlRequest(
      this.creds.token,
      VIEW_BUILDS_QUERY,
      {
        appId: projectId,
        offset: 0,
        limit: BUILD_PAGE_SIZE,
        filter: { platform: platform === "ios" ? "IOS" : "ANDROID", status: "FINISHED" },
      },
      this.fetchImpl,
    )) as any;
    const builds = (asArray(data?.app?.byId?.builds) as unknown[]).map(parseBuild);
    // The API answers newest-first (same query as `eas build:list`); sorting by
    // completedAt is a local safety net in case that ordering ever changes.
    return builds.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
}
