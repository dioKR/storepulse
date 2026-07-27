import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, ChannelStatus } from "../types.js";

/**
 * Serves canned statuses keyed by target key. Used by the CLI demo mode
 * and useful in tests for anything built on top of core.
 */
export class MockConnector implements StoreConnector {
  readonly id = "mock";

  constructor(private readonly fixtures: Record<string, ChannelStatus[]>) {}

  supports(target: AppTarget): boolean {
    return target.key in this.fixtures;
  }

  async fetchAppStatus(target: AppTarget): Promise<AppStatus> {
    return {
      target,
      channels: this.fixtures[target.key] ?? [],
      fetchedAt: new Date().toISOString(),
    };
  }
}
