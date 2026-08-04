/** Mobile platform whose store release status is being read. */
export type Platform = "ios" | "android";

/**
 * Unified release channel across both stores.
 * iOS: production = App Store, beta = TestFlight (external), internal = TestFlight (internal).
 * Android: production = production track, beta = open/closed testing, internal = internal testing.
 */
export type Channel = "production" | "beta" | "internal";

/**
 * Unified store release state; inspect `ChannelStatus.rawState` for the original API state.
 */
export type ReleaseState =
  | "live" // READY_FOR_SALE / track release completed
  | "rollout" // phased release (iOS) / staged rollout (Android) in progress
  | "in-review" // WAITING_FOR_REVIEW, IN_REVIEW / beta review in progress
  | "pending" // approved, waiting for developer release / processing
  | "rejected" // any *_REJECTED state
  | "halted" // rollout halted
  | "draft" // PREPARE_FOR_SUBMISSION / draft release
  | "unknown";

export interface AppTarget {
  /** Unique key within a config, e.g. "myapp-prod-ios" */
  key: string;
  /** Display name, e.g. "MyApp" */
  name: string;
  platform: Platform;
  /** ASC numeric app ID (ios) or package name (android) */
  storeId: string;
  /** Optional display grouping, e.g. "prod" | "dev" */
  group?: string;
  /**
   * EAS project ID (app.json → extra.eas.projectId). The ios and android
   * targets of the same app share one projectId — the platform filter
   * happens in the EAS build query, not here.
   */
  easProjectId?: string;
  /**
   * App identifier the EAS builds of this target carry (iOS bundle ID /
   * Android package name). Scopes EAS matching when one EAS project builds
   * multiple variants of the same platform (e.g. prod + dev bundle IDs).
   * Android defaults to `storeId` (already the package name); iOS has no
   * bundle ID elsewhere in the config, so set this to enable scoping there.
   */
  easAppIdentifier?: string;
}

/**
 * EAS build/submission info attached to a channel entry by the EasEnricher.
 * Pure enrichment: answers "which commit/profile/build is this store
 * version?" — every field optional, and the whole block absent when no
 * EAS build matches.
 */
export interface EasBuildInfo {
  /** EAS build profile, e.g. "production" */
  profile?: string;
  /** Full git commit hash the build was made from */
  commit?: string;
  /** EAS build ID (UUID) — `eas build:view <id>` */
  buildId?: string;
  /** ISO date the EAS build finished */
  completedAt?: string;
  /** Latest EAS submission status for this build, e.g. "FINISHED" */
  submissionStatus?: string;
}

export interface ChannelStatus {
  channel: Channel;
  /** Marketing version, e.g. "2.4.1". Null when the channel has no release. */
  version: string | null;
  /** Build number (iOS) / versionCode (Android) */
  build?: string | null;
  state: ReleaseState;
  /** Store-specific state string, e.g. "READY_FOR_SALE" or "inProgress" */
  rawState?: string;
  /** 0-100, present while state is "rollout" */
  rolloutPercent?: number;
  /** Release notes ("What's New" / Play release notes) for this release */
  releaseNotes?: string;
  /** ISO date. iOS: appStoreVersion createdDate / TestFlight build uploadedDate */
  date?: string;
  /** ISO date. TestFlight build expirationDate only */
  expiresAt?: string;
  /** EAS build info matched to this release (EasEnricher) */
  eas?: EasBuildInfo;
}

export interface AppStatus {
  target: AppTarget;
  channels: ChannelStatus[];
  /** ISO timestamp of when this status was fetched */
  fetchedAt: string;
  /** Set when the connector failed for this target; channels may be empty */
  error?: string;
}
