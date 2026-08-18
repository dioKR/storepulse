import { importPKCS8, SignJWT } from "jose";
import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, Channel, ChannelStatus, ReleaseState } from "../types.js";
import { asArray, asNumber, asString } from "./defensive.js";

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const LIFECYCLE_CACHE_TTL_MS = 60 * 60 * 1000;
const LIFECYCLE_ERROR_BACKOFF_MS = 5 * 60 * 1000;
const LIFECYCLE_QUOTA_BACKOFF_MS = 60 * 60 * 1000;

/** Google Play service-account material supplied directly by the caller. */
export interface GooglePlayCredentials {
  /** `client_email` from the service account JSON */
  clientEmail: string;
  /** `private_key` from the service account JSON (PEM string) */
  privateKey: string;
}

/**
 * Non-2xx answer from Google's OAuth token endpoint. Carries the response
 * body so `storepulse doctor` can tell `invalid_grant` (deleted key, clock
 * skew) apart from other failures (#6).
 */
export class PlayTokenExchangeError extends Error {
  constructor(
    readonly status: number,
    /** Raw response body ("" when it could not be read) */
    readonly body: string,
  ) {
    super(`Google OAuth token exchange failed (${status})`);
    this.name = "PlayTokenExchangeError";
  }
}

class PlayApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    method: string,
    path: string,
  ) {
    super(`Play API ${status} on ${method} ${path}`);
    this.name = "PlayApiRequestError";
  }
}

/**
 * Exchange a signed service-account JWT for a Play API access token
 * (valid 1 hour). `fetchImpl` is injectable for tests and `storepulse doctor`.
 */
export async function createPlayAccessToken(
  creds: GooglePlayCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = await importPKCS8(creds.privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new PlayTokenExchangeError(res.status, await res.text().catch(() => ""));
  }
  const data = await res.json();
  const accessToken = asString(data?.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth token response missing access_token");
  }
  return accessToken;
}

const RELEASE_STATE: Record<string, ReleaseState> = {
  completed: "live",
  inProgress: "rollout",
  halted: "halted",
  draft: "draft",
};

const RELEASE_LIFECYCLE_STATE: Record<string, ReleaseState> = {
  DRAFT: "draft",
  NOT_SENT_FOR_REVIEW: "draft",
  IN_REVIEW: "in-review",
  APPROVED_NOT_PUBLISHED: "pending",
  NOT_APPROVED: "rejected",
};

interface ReleaseLifecycleLookup {
  byTrackAndBuild: Map<string, string>;
  verifiedTrackAndBuild: Set<string>;
  sourceByTrack: Map<string, LifecycleCacheSource>;
}

type LifecycleCacheSource = "fresh" | "stale" | "quota-exceeded" | "unavailable";
type LifecycleFailure = "quota" | "error";
type LifecycleVerification = "verified" | "unverified" | "not-applicable";

interface TrackLifecycleResult {
  byBuild: Map<string, string>;
  verifiedBuilds: Set<string>;
  source: LifecycleCacheSource;
}

interface TrackLifecycleCacheEntry {
  byBuild: Map<string, string>;
  verifiedBuilds: Set<string>;
  hasValue: boolean;
  expiresAt: number;
  retryAt: number;
  failure?: LifecycleFailure;
  inflight?: Promise<TrackLifecycleResult>;
}

function releaseKey(track: string, build: string): string {
  return `${track}\u0000${build}`;
}

function trackCacheKey(pkg: string, track: string): string {
  return `${pkg}\u0000${track}`;
}

function releaseBuild(release: any): string | null {
  const lastVersionCode = asArray(release?.versionCodes).at(-1);
  if (lastVersionCode != null) return String(lastVersionCode);
  return asString(release?.name)?.match(/^(\d+)\s*\(.+\)$/)?.[1] ?? null;
}

function versionedBuilds(track: any): Set<string> {
  const builds = (asArray(track?.releases) as any[])
    .map(releaseBuild)
    .filter((build): build is string => build !== null);
  return new Set(builds);
}

function includesEveryBuild(cachedBuilds: Set<string>, currentBuilds: Set<string>): boolean {
  return [...currentBuilds].every((build) => cachedBuilds.has(build));
}

function lifecycleVerificationFor(
  verifiedTrackAndBuild: Set<string>,
  track: string | undefined,
  build: string | null,
): LifecycleVerification {
  if (!track || !build) return "not-applicable";
  return verifiedTrackAndBuild.has(releaseKey(track, build)) ? "verified" : "unverified";
}

function normalizeReleaseState(
  trackStatus: string | undefined,
  lifecycleState: string | undefined,
  lifecycleVerification: LifecycleVerification,
): ReleaseState {
  const normalizedLifecycleState = lifecycleState?.replace(/^RELEASE_LIFECYCLE_STATE_/, "");
  if (normalizedLifecycleState === "PUBLISHED") {
    return (trackStatus && RELEASE_STATE[trackStatus]) || "unknown";
  }
  if (normalizedLifecycleState) {
    return RELEASE_LIFECYCLE_STATE[normalizedLifecycleState] || "unknown";
  }
  if (lifecycleVerification === "unverified") return "unknown";

  // An in-progress track can be either under review or actively rolling out.
  // Only the release lifecycle API can distinguish those states safely.
  if (trackStatus === "inProgress") return "unknown";
  return (trackStatus && RELEASE_STATE[trackStatus]) || "unknown";
}

function lifecycleRawSuffix(
  trackStatus: string | undefined,
  lifecycleState: string | undefined,
  lifecycleVerification: LifecycleVerification,
  source: LifecycleCacheSource | undefined,
): string {
  const staleSuffix = source === "stale" ? "; lifecycleCache=stale" : "";
  if (lifecycleState) return `; lifecycle=${lifecycleState}${staleSuffix}`;
  if (lifecycleVerification !== "unverified" && trackStatus !== "inProgress") return "";
  let availability = "missing";
  if (source === "quota-exceeded") availability = "quota-exceeded";
  if (source === "unavailable") availability = "unavailable";
  return `; lifecycle=(${availability})${staleSuffix}`;
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof PlayApiRequestError &&
    (error.status === 429 || error.body.toLowerCase().includes("quota"))
  );
}

function trackToChannel(track: string): Channel {
  if (track === "production") return "production";
  if (track === "internal") return "internal";
  // "beta", "alpha", and custom closed-testing tracks all surface as beta
  return "beta";
}

/** Text from `release.releaseNotes[]` — locale priority ko-KR → en-US → first with text. */
function pickReleaseNotes(releaseNotes: unknown): string | undefined {
  const localized = (asArray(releaseNotes) as any[])
    .map((n) => ({ language: asString(n?.language), text: asString(n?.text) }))
    .filter((n) => n.text !== undefined);
  const pick =
    localized.find((n) => n.language === "ko-KR") ??
    localized.find((n) => n.language === "en-US") ??
    localized[0];
  return pick?.text;
}

/** Read-only connector for one Google Play service account. */
export class GooglePlayConnector implements StoreConnector {
  readonly id = "google-play";
  private readonly lifecycleCache = new Map<string, TrackLifecycleCacheEntry>();

  constructor(private readonly creds: GooglePlayCredentials) {}

  supports(target: AppTarget): boolean {
    return target.platform === "android";
  }

  async fetchAppStatus(target: AppTarget): Promise<AppStatus> {
    const token = await this.token();
    const pkg = target.storeId;

    // The Play API only exposes track info inside an "edit" transaction,
    // even for reads — create one, read tracks, then discard it.
    const edit = await this.request(token, "POST", `/applications/${pkg}/edits`);
    const editId = asString(edit?.id);
    if (!editId) {
      throw new Error("Play API: edits.insert returned no edit id (API shape changed?)");
    }
    try {
      const tracks = await this.request(
        token,
        "GET",
        `/applications/${pkg}/edits/${editId}/tracks`,
      );
      const trackList = asArray(tracks?.tracks) as any[];
      const lifecycleLookup = await this.fetchReleaseLifecycles(token, pkg, trackList);
      const channels: ChannelStatus[] = [];
      for (const track of trackList) {
        // Fields may vanish in a future API version — degrade to "unknown", never crash
        const trackName = asString(track?.track);
        for (const release of asArray(track?.releases) as any[]) {
          const status = asString(release?.status);
          // Play auto-names releases "33 (0.1.18)" (versionCode + versionName);
          // unwrap so the code isn't printed twice next to the build number
          let version: string | null = asString(release?.name) ?? null;
          const autoName = version?.match(/^(\d+)\s*\((.+)\)$/);
          if (autoName) version = autoName[2];
          const build = releaseBuild(release);
          const lifecycleState =
            trackName && build
              ? lifecycleLookup.byTrackAndBuild.get(releaseKey(trackName, build))
              : undefined;
          const lifecycleVerification = lifecycleVerificationFor(
            lifecycleLookup.verifiedTrackAndBuild,
            trackName,
            build,
          );
          const state = normalizeReleaseState(status, lifecycleState, lifecycleVerification);
          const userFraction = asNumber(release?.userFraction);
          const releaseNotes = pickReleaseNotes(release?.releaseNotes);
          const lifecycleRawState = lifecycleRawSuffix(
            status,
            lifecycleState,
            lifecycleVerification,
            trackName ? lifecycleLookup.sourceByTrack.get(trackName) : undefined,
          );
          channels.push({
            channel: trackToChannel(trackName ?? ""),
            version,
            build,
            state,
            rawState: `${trackName ?? "(track missing)"}/${status ?? "(status missing)"}${lifecycleRawState}`,
            ...(state === "rollout" &&
              userFraction !== undefined && {
                rolloutPercent: Math.round(userFraction * 100),
              }),
            ...(releaseNotes !== undefined && { releaseNotes }),
          });
        }
      }
      return { target, channels, fetchedAt: new Date().toISOString() };
    } finally {
      await this.request(token, "DELETE", `/applications/${pkg}/edits/${editId}`).catch(() => {});
    }
  }

  private async request(token: string, method: string, path: string): Promise<any> {
    const res = await fetch(`${PLAY_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new PlayApiRequestError(res.status, await res.text().catch(() => ""), method, path);
    }
    return res.status === 204 ? null : res.json();
  }

  private async fetchReleaseLifecycles(
    token: string,
    pkg: string,
    tracks: any[],
  ): Promise<ReleaseLifecycleLookup> {
    const buildsByTrack = new Map<string, Set<string>>();
    for (const track of tracks) {
      const trackName = asString(track?.track);
      const builds = versionedBuilds(track);
      if (!trackName || builds.size === 0) continue;
      const combinedBuilds = buildsByTrack.get(trackName) ?? new Set<string>();
      for (const build of builds) combinedBuilds.add(build);
      buildsByTrack.set(trackName, combinedBuilds);
    }

    const byTrackAndBuild = new Map<string, string>();
    const verifiedTrackAndBuild = new Set<string>();
    const sourceByTrack = new Map<string, LifecycleCacheSource>();

    await Promise.all(
      [...buildsByTrack].map(async ([trackName, currentBuilds]) => {
        const result = await this.fetchTrackLifecycle(token, pkg, trackName, currentBuilds);
        sourceByTrack.set(trackName, result.source);
        for (const [build, lifecycleState] of result.byBuild) {
          byTrackAndBuild.set(releaseKey(trackName, build), lifecycleState);
        }
        for (const build of result.verifiedBuilds) {
          verifiedTrackAndBuild.add(releaseKey(trackName, build));
        }
      }),
    );

    return { byTrackAndBuild, verifiedTrackAndBuild, sourceByTrack };
  }

  private async fetchTrackLifecycle(
    token: string,
    pkg: string,
    trackName: string,
    currentBuilds: Set<string>,
  ): Promise<TrackLifecycleResult> {
    const cacheKey = trackCacheKey(pkg, trackName);
    const cached = this.lifecycleCache.get(cacheKey) ?? {
      byBuild: new Map<string, string>(),
      verifiedBuilds: new Set<string>(),
      hasValue: false,
      expiresAt: 0,
      retryAt: 0,
    };
    this.lifecycleCache.set(cacheKey, cached);

    const now = Date.now();
    const cacheCoversCurrentBuilds = includesEveryBuild(cached.verifiedBuilds, currentBuilds);
    if (cached.hasValue && cacheCoversCurrentBuilds && now < cached.expiresAt) {
      return {
        byBuild: cached.byBuild,
        verifiedBuilds: cached.verifiedBuilds,
        source: "fresh",
      };
    }
    if (now < cached.retryAt) return this.cachedFallback(cached);
    if (cached.inflight) return cached.inflight;

    cached.inflight = this.refreshTrackLifecycle(token, pkg, trackName, currentBuilds, cached);
    try {
      return await cached.inflight;
    } finally {
      cached.inflight = undefined;
    }
  }

  private async refreshTrackLifecycle(
    token: string,
    pkg: string,
    trackName: string,
    currentBuilds: Set<string>,
    cached: TrackLifecycleCacheEntry,
  ): Promise<TrackLifecycleResult> {
    const path = `/applications/${encodeURIComponent(pkg)}/tracks/${encodeURIComponent(trackName)}/releases`;
    try {
      const response = await this.request(token, "GET", path);
      const byBuild = new Map<string, string>();
      for (const release of asArray(response?.releases) as any[]) {
        const lifecycleState = asString(release?.releaseLifecycleState);
        if (!lifecycleState) continue;
        for (const artifact of asArray(release?.activeArtifacts) as any[]) {
          const versionCode = artifact?.versionCode;
          if (typeof versionCode !== "string" && typeof versionCode !== "number") continue;
          byBuild.set(String(versionCode), lifecycleState);
        }
      }

      cached.byBuild = byBuild;
      cached.verifiedBuilds = new Set(currentBuilds);
      cached.hasValue = true;
      cached.expiresAt = Date.now() + LIFECYCLE_CACHE_TTL_MS;
      cached.retryAt = 0;
      cached.failure = undefined;
      return { byBuild, verifiedBuilds: cached.verifiedBuilds, source: "fresh" };
    } catch (error) {
      cached.failure = isQuotaError(error) ? "quota" : "error";
      const backoff =
        cached.failure === "quota" ? LIFECYCLE_QUOTA_BACKOFF_MS : LIFECYCLE_ERROR_BACKOFF_MS;
      cached.retryAt = Date.now() + backoff;
      return this.cachedFallback(cached);
    }
  }

  private cachedFallback(cached: TrackLifecycleCacheEntry): TrackLifecycleResult {
    if (cached.hasValue) {
      return {
        byBuild: cached.byBuild,
        verifiedBuilds: cached.verifiedBuilds,
        source: "stale",
      };
    }
    return {
      byBuild: cached.byBuild,
      verifiedBuilds: cached.verifiedBuilds,
      source: cached.failure === "quota" ? "quota-exceeded" : "unavailable",
    };
  }

  private async token(): Promise<string> {
    return createPlayAccessToken(this.creds);
  }
}
