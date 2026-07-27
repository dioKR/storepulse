import type { AppStatus } from "@storepulse/core";
import { describe, expect, it } from "vitest";
import { renderBoard } from "./render.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

const target = (key: string, platform: "ios" | "android" = "ios") => ({
  key,
  name: "Aurora",
  platform,
  storeId: platform === "ios" ? "123" : "com.example.aurora",
});

describe("renderBoard", () => {
  it("renders an unknown rawState as a visible UNKNOWN badge with the raw state", () => {
    const statuses: AppStatus[] = [
      {
        target: target("aurora-ios"),
        channels: [
          {
            channel: "production",
            version: "2.4.1",
            state: "unknown",
            rawState: "SOME_BRAND_NEW_STATE",
          },
        ],
        fetchedAt: new Date().toISOString(),
      },
    ];

    const out = stripAnsi(renderBoard(statuses));
    expect(out).toContain("UNKNOWN");
    expect(out).toContain("(SOME_BRAND_NEW_STATE)");
    expect(out).toContain("2.4.1");
  });

  it("does not crash when an unknown-state channel has no rawState or version", () => {
    const statuses: AppStatus[] = [
      {
        target: target("aurora-android", "android"),
        channels: [{ channel: "beta", version: null, state: "unknown" }],
        fetchedAt: new Date().toISOString(),
      },
    ];

    const out = stripAnsi(renderBoard(statuses));
    expect(out).toContain("UNKNOWN");
    expect(out).toContain("?"); // missing version placeholder
  });

  it("keeps rendering the rest of the board when one target errored", () => {
    const statuses: AppStatus[] = [
      {
        target: target("broken-ios"),
        channels: [],
        fetchedAt: new Date().toISOString(),
        error: "ASC API 500 on /apps/123/appStoreVersions",
      },
      {
        target: target("aurora-android", "android"),
        channels: [
          {
            channel: "production",
            version: "1.0.0",
            build: "42",
            state: "unknown",
            rawState: "production/someFutureStatus",
          },
        ],
        fetchedAt: new Date().toISOString(),
      },
    ];

    const out = stripAnsi(renderBoard(statuses));
    expect(out).toContain("error: ASC API 500");
    expect(out).toContain("UNKNOWN");
    expect(out).toContain("(production/someFutureStatus)");
  });

  it("renders a full board of known states without throwing", () => {
    const statuses: AppStatus[] = [
      {
        target: target("aurora-ios"),
        channels: [
          { channel: "production", version: "2.4.1", state: "live", rawState: "READY_FOR_SALE" },
          { channel: "beta", version: "2.5.0", build: "108", state: "in-review" },
        ],
        fetchedAt: new Date().toISOString(),
      },
    ];

    const out = stripAnsi(renderBoard(statuses));
    expect(out).toContain("LIVE");
    expect(out).toContain("REVIEW");
    expect(out).toContain("Aurora");
  });
});
