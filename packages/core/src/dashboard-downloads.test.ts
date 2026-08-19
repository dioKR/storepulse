import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JS module shared with the static dashboard
import * as downloads from "../../dashboard/src/downloads.js";

const { androidReleases, installUrlFor, latestTesterUrlFor } = downloads;

const target = {
  key: "app-android",
  name: "App",
  platform: "android",
  storeId: "com.example.app",
  latestTesterUrl: "https://play.google.com/apps/internaltest/1234567890",
  installLinks: {
    "99": "https://play.google.com/apps/test/com.example.app/99",
    "100": "https://play.google.com/apps/test/com.example.app/100",
  },
};

describe("dashboard Android install URLs", () => {
  it("returns only explicit, safe URLs for the matching versionCode", () => {
    expect(installUrlFor(target, { build: "100" })).toBe(
      "https://play.google.com/apps/test/com.example.app/100",
    );
    expect(installUrlFor(target, { build: "101" })).toBeNull();
    expect(latestTesterUrlFor(target)).toBe("https://play.google.com/apps/internaltest/1234567890");
  });

  it.each([
    [{ ...target, platform: "ios" }, { build: "100" }],
    [{ ...target, installLinks: { "100": "http://example.com/100" } }, { build: "100" }],
    [
      { ...target, installLinks: { "100": "https://user:secret@example.com/100" } },
      { build: "100" },
    ],
    [target, { build: null }],
  ])("rejects an unsafe or incomplete target/entry pair", (candidate, entry) => {
    expect(installUrlFor(candidate, entry)).toBeNull();
  });

  it("keeps releases without links, deduplicates tracks, and sorts newest first", () => {
    const app = {
      target,
      fetchedAt: "2026-08-19T00:00:00.000Z",
      channels: [
        { channel: "production", version: "1.0.0", build: "99", state: "live" },
        { channel: "beta", version: "1.1.0", build: "100", state: "live" },
        {
          channel: "internal",
          version: "1.1.0",
          build: "100",
          state: "live",
          releaseNotes: "New tester flow",
        },
        { channel: "internal", version: "1.2.0", build: "101", state: "draft" },
      ],
    };

    const releases = androidReleases(app);
    expect(releases.map((release: { build: string }) => release.build)).toEqual([
      "101",
      "100",
      "99",
    ]);
    expect(releases[0].installUrl).toBeNull();
    expect(releases[1]).toMatchObject({
      channels: ["beta", "internal"],
      releaseNotes: "New tester flow",
      installUrl: "https://play.google.com/apps/test/com.example.app/100",
    });
  });
});
