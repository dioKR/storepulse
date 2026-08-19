import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppStatus, createSnapshot, diffSnapshots, type Snapshot } from "@storepulse/core";
import { afterEach, describe, expect, it } from "vitest";
import { parseDiffArgs, readSnapshot, renderSnapshotDiff } from "./diff.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true });
});

function app(state: "live" | "in-review" = "live"): AppStatus {
  return {
    target: { key: "my-ios", name: "My App", platform: "ios", storeId: "123" },
    channels: [
      {
        channel: "production",
        version: "1.2.3",
        build: "42",
        state,
      },
    ],
    fetchedAt: "2026-08-01T00:00:00.000Z",
  };
}

function snapshot(status: AppStatus, date: string): Snapshot {
  return createSnapshot([status], new Date(date));
}

describe("parseDiffArgs", () => {
  it("accepts offline and live comparisons", () => {
    expect(parseDiffArgs(["before.json", "after.json"])).toEqual({
      beforePath: "before.json",
      afterPath: "after.json",
      demo: false,
    });
    expect(parseDiffArgs(["before.json", "--demo"])).toEqual({
      beforePath: "before.json",
      afterPath: undefined,
      demo: true,
    });
  });

  it("rejects ambiguous arguments with a localized usage message", () => {
    expect(() => parseDiffArgs([], "ko")).toThrow("사용법");
    expect(() => parseDiffArgs(["before.json", "after.json", "--demo"])).toThrow("usage");
  });
});

describe("readSnapshot", () => {
  it("reads a valid snapshot", () => {
    const path = writeTempSnapshot(snapshot(app(), "2026-08-01T00:00:00.000Z"));
    expect(readSnapshot(path).apps[0]?.target.key).toBe("my-ios");
  });

  it("accepts optional verified Android install links without a schema bump", () => {
    const android = app();
    android.target = {
      key: "my-android",
      name: "My App",
      platform: "android",
      storeId: "com.example.app",
      latestTesterUrl: "https://play.google.com/apps/internaltest/1234567890",
      installLinks: { "42": "https://play.google.com/apps/test/com.example.app/42" },
    };
    const path = writeTempSnapshot(snapshot(android, "2026-08-01T00:00:00.000Z"));

    expect(readSnapshot(path).apps[0]?.target.installLinks?.["42"]).toContain("/42");
  });

  it("rejects schema mismatches and invalid documents", () => {
    const wrongVersion = writeTempSnapshot({ schemaVersion: 2, generatedAt: "x", apps: [] });
    expect(() => readSnapshot(wrongVersion, "ko")).toThrow("schemaVersion은 2");

    const invalid = writeTempSnapshot({ schemaVersion: 1, generatedAt: "x", apps: [{}] });
    expect(() => readSnapshot(invalid)).toThrow("does not match");
  });
});

describe("renderSnapshotDiff", () => {
  it("renders no changes in the selected language", () => {
    const before = snapshot(app(), "2026-08-01T00:00:00.000Z");
    const after = snapshot(app(), "2026-08-02T00:00:00.000Z");
    expect(renderSnapshotDiff(diffSnapshots(before, after), "ko")).toContain(
      "릴리즈 상태 변경 없음",
    );
  });

  it("renders a state transition with fixed English channel and badge terms", () => {
    const before = snapshot(app("in-review"), "2026-08-01T00:00:00.000Z");
    const after = snapshot(app("live"), "2026-08-02T00:00:00.000Z");
    const output = renderSnapshotDiff(diffSnapshots(before, after), "ko");

    expect(output).toContain("앱 변경됨");
    expect(output).toContain("PRODUCTION");
    expect(output).toContain("REVIEW");
    expect(output).toContain("LIVE");
    expect(output).toContain("(42)");
    expect(output).toContain("변경: state");
  });
});

function writeTempSnapshot(value: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "storepulse-diff-"));
  tempDirectories.push(directory);
  const path = join(directory, "status.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}
