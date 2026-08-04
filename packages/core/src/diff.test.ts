import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff.js";
import { createSnapshot, type Snapshot } from "./snapshot.js";
import type { AppStatus, ChannelStatus } from "./types.js";

const live: ChannelStatus = {
  channel: "production",
  version: "1.0.0",
  build: "10",
  state: "live",
  rawState: "READY_FOR_SALE",
};

function app(key: string, channels: ChannelStatus[] = [live]): AppStatus {
  return {
    target: { key, name: key, platform: "ios", storeId: key },
    channels,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshot(apps: AppStatus[], date: string): Snapshot {
  return createSnapshot(apps, new Date(date));
}

describe("diffSnapshots", () => {
  it("ignores generatedAt, fetchedAt, app order and channel order", () => {
    const before = snapshot(
      [
        app("a", [live, { channel: "beta", version: "1.1.0", build: "11", state: "live" }]),
        app("b"),
      ],
      "2026-01-01T00:00:00.000Z",
    );
    const after = snapshot(
      [
        { ...app("b"), fetchedAt: "2026-02-01T00:00:00.000Z" },
        app("a", [{ channel: "beta", version: "1.1.0", build: "11", state: "live" }, live]),
      ],
      "2026-02-01T00:00:00.000Z",
    );

    expect(diffSnapshots(before, after).apps).toEqual([]);
  });

  it("reports state and rollout changes for the same release identity", () => {
    const before = snapshot(
      [app("a", [{ ...live, state: "in-review", rawState: "IN_REVIEW" }])],
      "2026-01-01T00:00:00.000Z",
    );
    const after = snapshot(
      [app("a", [{ ...live, state: "rollout", rawState: "READY_FOR_SALE", rolloutPercent: 10 }])],
      "2026-02-01T00:00:00.000Z",
    );

    expect(diffSnapshots(before, after).apps).toMatchObject([
      {
        kind: "changed",
        key: "a",
        targetChanged: false,
        errorChanged: false,
        channels: [
          { kind: "changed", before: { state: "in-review" }, after: { state: "rollout" } },
        ],
      },
    ]);
  });

  it("reports added and removed releases independently", () => {
    const before = snapshot([app("a", [live])], "2026-01-01T00:00:00.000Z");
    const beta = { channel: "beta", version: "1.1.0", build: "11", state: "live" } as const;
    const after = snapshot([app("a", [beta])], "2026-02-01T00:00:00.000Z");

    expect(diffSnapshots(before, after).apps[0]?.channels).toEqual([
      { kind: "added", after: beta },
      { kind: "removed", before: live },
    ]);
  });

  it("reports apps added and removed", () => {
    const before = snapshot([app("removed")], "2026-01-01T00:00:00.000Z");
    const after = snapshot([app("added")], "2026-02-01T00:00:00.000Z");

    expect(diffSnapshots(before, after).apps.map(({ kind, key }) => ({ kind, key }))).toEqual([
      { kind: "added", key: "added" },
      { kind: "removed", key: "removed" },
    ]);
  });

  it("reports target metadata and fetch errors without treating fetchedAt as data", () => {
    const before = snapshot([app("a")], "2026-01-01T00:00:00.000Z");
    const changed = app("a");
    changed.target.name = "Renamed";
    changed.error = "ASC API 500";
    changed.fetchedAt = "2026-02-01T00:00:00.000Z";
    const after = snapshot([changed], "2026-02-01T00:00:00.000Z");

    expect(diffSnapshots(before, after).apps[0]).toMatchObject({
      kind: "changed",
      key: "a",
      targetChanged: true,
      errorChanged: true,
      channels: [],
    });
  });
});
