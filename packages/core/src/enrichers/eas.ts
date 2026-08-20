import { asArray, asString } from "../connectors/defensive.js";
import type { Enricher } from "../enricher.js";
import type { AppStatus, ChannelStatus, EasBuildInfo, EasUpdateInfo, Platform } from "../types.js";

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
/** How many recent update groups to consider per EAS project. */
const UPDATE_GROUP_PAGE_SIZE = 50;

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

/** eas-cli UpdateQuery.viewUpdateGroupsOnAppAsync, trimmed to consumed fields. */
const VIEW_UPDATE_GROUPS_QUERY = `
  query ViewUpdateGroupsOnApp($appId: String!, $offset: Int!, $limit: Int!) {
    app {
      byId(appId: $appId) {
        id
        updateGroups(offset: $offset, limit: $limit) {
          id
          group
          message
          createdAt
          platform
          manifestFragment
          manifestPermalink
          gitCommitHash
          runtime {
            version
          }
          branch {
            name
          }
          rolloutPercentage
          isRollBackToEmbedded
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

/** One EAS Update platform record, including binary identity from its manifest. */
interface EasUpdate {
  groupId?: string;
  appVersion?: string;
  appBuildVersion?: string;
  appIdentifier?: string;
  branch?: string;
  message?: string;
  commit?: string;
  createdAt?: string;
  runtimeVersion?: string;
  rolloutPercentage?: number;
  manifestPermalink?: string;
  isRollbackToEmbedded?: boolean;
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

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Parse binary identity from the Expo config embedded in manifestFragment. */
function parseUpdate(raw: any, platform: Platform): EasUpdate | undefined {
  const apiPlatform = platform === "ios" ? "IOS" : "ANDROID";
  if (asString(raw?.platform)?.toUpperCase() !== apiPlatform) return undefined;

  const fragment = asString(raw?.manifestFragment);
  if (fragment === undefined) return undefined;

  let manifest: any;
  try {
    manifest = JSON.parse(fragment);
  } catch {
    return undefined;
  }

  const expoClient = manifest?.extra?.expoClient;
  if (typeof expoClient !== "object" || expoClient === null) return undefined;

  const native = platform === "ios" ? expoClient.ios : expoClient.android;
  const rawBuild = platform === "ios" ? native?.buildNumber : native?.versionCode;
  const appBuildVersion =
    typeof rawBuild === "string" || typeof rawBuild === "number" ? String(rawBuild) : undefined;
  const appIdentifier = asString(platform === "ios" ? native?.bundleIdentifier : native?.package);
  const groupId = asString(raw?.group) ?? asString(raw?.id);
  const appVersion = asString(expoClient?.version);
  const branch = asString(raw?.branch?.name);
  const message = asString(raw?.message);
  const commit = asString(raw?.gitCommitHash);
  const createdAt = asString(raw?.createdAt);
  const runtimeVersion = asString(raw?.runtime?.version);
  const rolloutPercentage = asFiniteNumber(raw?.rolloutPercentage);
  const manifestPermalink = asString(raw?.manifestPermalink);
  const isRollbackToEmbedded =
    typeof raw?.isRollBackToEmbedded === "boolean" ? raw.isRollBackToEmbedded : undefined;

  return {
    ...(groupId !== undefined && { groupId }),
    ...(appVersion !== undefined && { appVersion }),
    ...(appBuildVersion !== undefined && { appBuildVersion }),
    ...(appIdentifier !== undefined && { appIdentifier }),
    ...(branch !== undefined && { branch }),
    ...(message !== undefined && { message }),
    ...(commit !== undefined && { commit }),
    ...(createdAt !== undefined && { createdAt }),
    ...(runtimeVersion !== undefined && { runtimeVersion }),
    ...(rolloutPercentage !== undefined && { rolloutPercentage }),
    ...(manifestPermalink !== undefined && { manifestPermalink }),
    ...(isRollbackToEmbedded !== undefined && { isRollbackToEmbedded }),
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

function scopeUpdates(updates: EasUpdate[], expected: string | undefined): EasUpdate[] {
  if (expected !== undefined) {
    return updates.filter((update) => update.appIdentifier === expected);
  }
  const identifiers = new Set(
    updates.map((update) => update.appIdentifier).filter((value) => value !== undefined),
  );
  return identifiers.size <= 1 ? updates : [];
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

/**
 * Pick the newest record only when all candidates belong to one EAS branch.
 * Without an explicit channel-to-branch mapping, records spanning branches
 * are ambiguous: an update published to development is not proof that a
 * production binary received it, even when native identity is identical.
 */
function pickUnambiguousUpdate(candidates: EasUpdate[]): EasUpdate | undefined {
  if (candidates.length === 0) return undefined;
  const branches = new Set(candidates.map((update) => update.branch ?? null));
  if (branches.size > 1) return undefined;
  return candidates.reduce((latest, update) =>
    (update.createdAt ?? "").localeCompare(latest.createdAt ?? "") > 0 ? update : latest,
  );
}

/**
 * Match an OTA update to the native binary represented by a store channel.
 * Version + build must match when both are known. A custom Play release name
 * can fall back to a unique versionCode, matching the EAS build behavior.
 * Missing build numbers and multi-branch candidates stay conservative.
 */
export function matchEasUpdate(
  channel: Pick<ChannelStatus, "version" | "build">,
  updates: EasUpdate[],
): EasUpdate | undefined {
  if (channel.version == null) return undefined;
  const sameVersion = updates.filter((update) => update.appVersion === channel.version);
  if (sameVersion.length > 0) {
    if (channel.build != null) {
      return pickUnambiguousUpdate(
        sameVersion.filter((update) => update.appBuildVersion === channel.build),
      );
    }
    const builds = new Set(sameVersion.map((update) => update.appBuildVersion ?? null));
    return builds.size === 1 ? pickUnambiguousUpdate(sameVersion) : undefined;
  }
  if (channel.build != null) {
    const sameBuild = updates.filter((update) => update.appBuildVersion === channel.build);
    const versions = new Set(sameBuild.map((update) => update.appVersion ?? null));
    return versions.size === 1 ? pickUnambiguousUpdate(sameBuild) : undefined;
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

function withEasUpdateInfo(channel: ChannelStatus, updates: EasUpdate[]): ChannelStatus {
  const match = matchEasUpdate(channel, updates);
  if (!match) return channel;
  const easUpdate: EasUpdateInfo = {
    ...(match.groupId !== undefined && { groupId: match.groupId }),
    ...(match.branch !== undefined && { branch: match.branch }),
    ...(match.message !== undefined && { message: match.message }),
    ...(match.commit !== undefined && { commit: match.commit }),
    ...(match.createdAt !== undefined && { createdAt: match.createdAt }),
    ...(match.runtimeVersion !== undefined && { runtimeVersion: match.runtimeVersion }),
    ...(match.rolloutPercentage !== undefined && {
      rolloutPercentage: match.rolloutPercentage,
    }),
    ...(match.manifestPermalink !== undefined && {
      manifestPermalink: match.manifestPermalink,
    }),
    ...(match.isRollbackToEmbedded !== undefined && {
      isRollbackToEmbedded: match.isRollbackToEmbedded,
    }),
  };
  if (Object.keys(easUpdate).length === 0) return channel;
  return { ...channel, easUpdate };
}

/**
 * Attaches EAS build/submission and OTA update info to channel entries whose
 * target has an `easProjectId`. Build and update query failures are isolated;
 * the store board itself never dies on EAS problems.
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
      const key = `${projectId}::${status.target.platform}`;
      wanted.set(key, { projectId, platform: status.target.platform });
    }

    const buildsByKey = new Map<string, EasBuild[]>();
    const projectIds = new Set([...wanted.values()].map(({ projectId }) => projectId));
    const updatesByProject = new Map<string, Record<Platform, EasUpdate[]>>();
    await Promise.all([
      ...[...wanted.entries()].map(async ([key, { projectId, platform }]) => {
        try {
          buildsByKey.set(key, await this.fetchFinishedBuilds(projectId, platform));
        } catch {
          // This project × platform is skipped; everything else still enriches.
        }
      }),
      ...[...projectIds].map(async (projectId) => {
        try {
          updatesByProject.set(projectId, await this.fetchUpdates(projectId));
        } catch {
          // OTA enrichment is independent of build enrichment.
        }
      }),
    ]);

    return statuses.map((status) => {
      const projectId = status.target.easProjectId;
      if (!projectId) return status;
      const expected =
        status.target.easAppIdentifier ??
        (status.target.platform === "android" ? status.target.storeId : undefined);
      const builds = buildsByKey.get(`${projectId}::${status.target.platform}`) ?? [];
      const updates = updatesByProject.get(projectId)?.[status.target.platform] ?? [];
      const scopedBuilds = scopeBuilds(builds, expected);
      const scopedUpdates = scopeUpdates(updates, expected);
      if (scopedBuilds.length === 0 && scopedUpdates.length === 0) return status;
      return {
        ...status,
        channels: status.channels.map((channel) =>
          withEasUpdateInfo(withEasInfo(channel, scopedBuilds), scopedUpdates),
        ),
      };
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

  /** Recent update groups split into platform records, newest first. */
  private async fetchUpdates(projectId: string): Promise<Record<Platform, EasUpdate[]>> {
    const data = (await easGraphqlRequest(
      this.creds.token,
      VIEW_UPDATE_GROUPS_QUERY,
      { appId: projectId, offset: 0, limit: UPDATE_GROUP_PAGE_SIZE },
      this.fetchImpl,
    )) as any;
    const groups = asArray(data?.app?.byId?.updateGroups) as unknown[];
    const rawUpdates = groups.flatMap((group) => asArray(group));
    const ios = rawUpdates
      .map((raw) => parseUpdate(raw, "ios"))
      .filter((update): update is EasUpdate => update !== undefined)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const android = rawUpdates
      .map((raw) => parseUpdate(raw, "android"))
      .filter((update): update is EasUpdate => update !== undefined)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return { ios, android };
  }
}
