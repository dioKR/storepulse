export type Platform = "ios" | "android";

/**
 * Unified release channel across both stores.
 * iOS: production = App Store, beta = TestFlight (external), internal = TestFlight (internal)
 * Android: production = production track, beta = open/closed testing, internal = internal testing
 */
export type Channel = "production" | "beta" | "internal";

/**
 * Unified release state across both stores.
 * Store-specific raw states are preserved in `rawState` for debugging.
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
}

export interface AppStatus {
  target: AppTarget;
  channels: ChannelStatus[];
  /** ISO timestamp of when this status was fetched */
  fetchedAt: string;
  /** Set when the connector failed for this target; channels may be empty */
  error?: string;
}
