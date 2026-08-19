import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JS module shared with the static dashboard
import * as downloads from "../../dashboard/src/downloads.js";

const { hasInstallableReleases, installableReleases, installUrlFor } = downloads;

const target = {
  key: "app-android",
  name: "App",
  platform: "android",
  storeId: "com.example.app",
  installUrlTemplate: "https://play.google.com/apps/test/{storeId}/{build}",
};

describe("dashboard Android install URLs", () => {
  it("substitutes the package and versionCode into an HTTPS template", () => {
    expect(installUrlFor(target, { build: "42" })).toBe(
      "https://play.google.com/apps/test/com.example.app/42",
    );
  });

  it.each([
    [{ ...target, platform: "ios" }, { build: "42" }],
    [{ ...target, installUrlTemplate: "http://example.com/{storeId}/{build}" }, { build: "42" }],
    [{ ...target, installUrlTemplate: "javascript:{storeId}/{build}" }, { build: "42" }],
    [{ ...target, installUrlTemplate: "https://example.com/{storeId}" }, { build: "42" }],
    [target, { build: null }],
  ])("rejects an unsafe or incomplete target/entry pair", (candidate, entry) => {
    expect(installUrlFor(candidate, entry)).toBeNull();
  });

  it("deduplicates builds across tracks, merges metadata, and sorts newest first", () => {
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
        { channel: "internal", version: "preview", build: "preview", state: "draft" },
      ],
    };

    const releases = installableReleases(app);
    expect(releases.map((release: { build: string }) => release.build)).toEqual([
      "100",
      "99",
      "preview",
    ]);
    expect(releases[0]).toMatchObject({
      version: "1.1.0",
      channels: ["beta", "internal"],
      releaseNotes: "New tester flow",
    });
    expect(hasInstallableReleases(app)).toBe(true);
  });
});
