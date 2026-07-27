import type { AppStatus, AppTarget } from "./types.js";

/**
 * A source of release status for app targets.
 * Implementations must be constructed with their own credentials —
 * connectors never read process.env or the filesystem on their own.
 */
export interface StoreConnector {
  /** Stable identifier, e.g. "app-store-connect", "google-play" */
  readonly id: string;
  /** Whether this connector can serve the given target */
  supports(target: AppTarget): boolean;
  fetchAppStatus(target: AppTarget): Promise<AppStatus>;
}

/**
 * Fetch status for every target using the first connector that supports it.
 * Failures are captured per-target in `AppStatus.error` instead of throwing,
 * so one bad credential never hides the rest of the board.
 */
export async function fetchAll(
  connectors: StoreConnector[],
  targets: AppTarget[],
): Promise<AppStatus[]> {
  return Promise.all(
    targets.map(async (target): Promise<AppStatus> => {
      const connector = connectors.find((c) => c.supports(target));
      if (!connector) {
        return {
          target,
          channels: [],
          fetchedAt: new Date().toISOString(),
          error: `no connector supports platform "${target.platform}"`,
        };
      }
      try {
        return await connector.fetchAppStatus(target);
      } catch (err) {
        return {
          target,
          channels: [],
          fetchedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
