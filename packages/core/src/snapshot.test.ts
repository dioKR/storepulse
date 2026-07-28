import { describe, expect, it } from "vitest";
import { createSnapshot, SNAPSHOT_SCHEMA_VERSION } from "./snapshot.js";
import type { AppStatus } from "./types.js";

const status: AppStatus = {
  target: { key: "a-ios", name: "A", platform: "ios", storeId: "1" },
  channels: [{ channel: "production", version: "1.0.0", state: "live" }],
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

describe("createSnapshot", () => {
  it("stamps the current schema version and an ISO generatedAt", () => {
    const snap = createSnapshot([status], new Date("2026-02-03T04:05:06.789Z"));
    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(Number.isInteger(snap.schemaVersion)).toBe(true);
    expect(snap.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(snap.generatedAt).toBe("2026-02-03T04:05:06.789Z");
    expect(snap.apps).toEqual([status]);
  });

  it("round-trips through JSON without loss", () => {
    const snap = createSnapshot([status]);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});
