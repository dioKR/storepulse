import { describe, expect, it } from "vitest";
import { fetchAll, type StoreConnector } from "./connector.js";
import type { AppTarget } from "./types.js";

const iosTarget: AppTarget = { key: "a-ios", name: "A", platform: "ios", storeId: "1" };
const androidTarget: AppTarget = {
  key: "a-android",
  name: "A",
  platform: "android",
  storeId: "com.a",
};

describe("fetchAll", () => {
  it("captures connector crashes as per-target errors instead of rejecting", async () => {
    const crashing: StoreConnector = {
      id: "crashing",
      supports: (t) => t.platform === "ios",
      fetchAppStatus: async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'attributes')");
      },
    };
    const healthy: StoreConnector = {
      id: "healthy",
      supports: (t) => t.platform === "android",
      fetchAppStatus: async (t) => ({
        target: t,
        channels: [{ channel: "production", version: "1.0.0", state: "live" }],
        fetchedAt: new Date().toISOString(),
      }),
    };

    const statuses = await fetchAll([crashing, healthy], [iosTarget, androidTarget]);
    expect(statuses).toHaveLength(2);
    expect(statuses[0].error).toMatch(/attributes/);
    expect(statuses[0].channels).toEqual([]);
    expect(statuses[1].error).toBeUndefined();
    expect(statuses[1].channels[0].state).toBe("live");
  });

  it("reports targets no connector supports", async () => {
    const statuses = await fetchAll([], [iosTarget]);
    expect(statuses[0].error).toContain('no connector supports platform "ios"');
  });
});
