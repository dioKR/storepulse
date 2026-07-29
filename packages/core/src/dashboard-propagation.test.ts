import { describe, expect, it } from "vitest";
/**
 * The dashboard's propagation math (issue #32) lives in a plain JS module so
 * the static SPA can import it without a build step — this pins its behavior
 * from Node, the same way i18n/dashboard-bundle.test.ts pins the i18n bundle.
 */
// @ts-expect-error — plain JS module without type declarations
import * as propagation from "../../dashboard/src/propagation.js";

const { channelPropagation, compareBuilds, compareVersions, formatBundle, latestBundle } =
  propagation;

describe("compareVersions", () => {
  it("compares numeric segments as numbers, not strings", () => {
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("10.0.0", "9.99.99")).toBe(1);
  });

  it("treats equal versions as equal, even with leading zeros", () => {
    expect(compareVersions("2.4.1", "2.4.1")).toBe(0);
    expect(compareVersions("2.04.1", "2.4.1")).toBe(0);
  });

  it("ranks a missing segment lower", () => {
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });

  it("falls back to string comparison for non-numeric segments", () => {
    expect(compareVersions("1.0.beta", "1.0.alpha")).toBe(1);
    expect(compareVersions("1.0.alpha", "1.0.beta")).toBe(-1);
    expect(compareVersions("1.0.rc1", "1.0.rc1")).toBe(0);
  });
});

describe("compareBuilds", () => {
  it("compares numerically when both builds are numbers", () => {
    expect(compareBuilds("9", "108")).toBe(-1);
    expect(compareBuilds("241", "241")).toBe(0);
    expect(compareBuilds("251", "250")).toBe(1);
  });

  it("falls back to string comparison for non-numeric segments", () => {
    expect(compareBuilds("abc", "abd")).toBe(-1);
  });
});

describe("latestBundle", () => {
  it("picks the highest version across all channels", () => {
    const latest = latestBundle([
      { channel: "production", version: "2.4.1", build: "241" },
      { channel: "beta", version: "2.5.0", build: "250" },
      { channel: "internal", version: "2.5.1", build: "251" },
    ]);
    expect(latest).toEqual({ version: "2.5.1", build: "251" });
  });

  it("breaks a version tie with the build number", () => {
    const latest = latestBundle([
      { channel: "beta", version: "2.5.0", build: "108" },
      { channel: "internal", version: "2.5.0", build: "112" },
    ]);
    expect(latest).toEqual({ version: "2.5.0", build: "112" });
  });

  it("prefers an entry with a build over a build-less tie (iOS production)", () => {
    // ASC production has no build number — the beta row supplies it.
    const latest = latestBundle([
      { channel: "production", version: "1.9.3" },
      { channel: "beta", version: "1.9.3", build: "87" },
    ]);
    expect(latest).toEqual({ version: "1.9.3", build: "87" });
  });

  it("skips version-less entries and reports build: null when none has one", () => {
    expect(latestBundle([{ channel: "production", version: null }])).toBeNull();
    expect(latestBundle([])).toBeNull();
    expect(
      latestBundle([
        { channel: "production", version: null },
        { channel: "beta", version: "1.0.0" },
      ]),
    ).toEqual({ version: "1.0.0", build: null });
  });
});

describe("channelPropagation", () => {
  const latest = { version: "2.5.0", build: "108" };

  it("returns null without a latest bundle or without comparable entries", () => {
    expect(channelPropagation([{ version: "1.0.0" }], null)).toBeNull();
    expect(channelPropagation([], latest)).toBeNull();
    expect(channelPropagation([{ version: null }], latest)).toBeNull();
  });

  it("reports latest when an entry matches version and build", () => {
    expect(channelPropagation([{ version: "2.5.0", build: "108" }], latest)).toEqual({
      status: "latest",
    });
  });

  it("judges by version alone when either side has no build (iOS production caveat)", () => {
    // ASC production carries no build number → the version match is enough.
    expect(channelPropagation([{ version: "2.5.0" }], latest)).toEqual({ status: "latest" });
    expect(
      channelPropagation([{ version: "2.5.0", build: "108" }], { version: "2.5.0", build: null }),
    ).toEqual({ status: "latest" });
  });

  it("reports behind with the channel's own newest entry", () => {
    expect(
      channelPropagation(
        [
          { version: "2.3.0", build: "230" },
          { version: "2.4.1", build: "241" },
        ],
        latest,
      ),
    ).toEqual({ status: "behind", version: "2.4.1", build: "241" });
  });

  it("reports behind on a same-version but lower build (both builds known)", () => {
    expect(channelPropagation([{ version: "2.5.0", build: "100" }], latest)).toEqual({
      status: "behind",
      version: "2.5.0",
      build: "100",
    });
  });

  it("reports latest when any one of several entries matches", () => {
    const entries = [
      { version: "2.4.1", build: "90" },
      { version: "2.5.0", build: "108" },
    ];
    expect(channelPropagation(entries, latest)).toEqual({ status: "latest" });
  });
});

describe("formatBundle", () => {
  it("appends the build in parentheses only when present", () => {
    expect(formatBundle({ version: "2.5.0", build: "108" })).toBe("2.5.0 (108)");
    expect(formatBundle({ version: "2.5.0", build: null })).toBe("2.5.0");
  });
});

describe("android — versionCode-first ordering (custom release names)", () => {
  const { latestBundle, channelPropagation } = propagation;

  it("orders by versionCode even when versions are arbitrary release names", () => {
    const entries = [
      { channel: "production", version: "0.1.16", build: "30", state: "live" },
      { channel: "internal", version: "여름 이벤트 릴리즈", build: "33", state: "live" },
    ];
    expect(latestBundle(entries, "android")).toEqual({
      version: "여름 이벤트 릴리즈",
      build: "33",
    });
  });

  it("matches by versionCode identity even when release names differ per channel", () => {
    const latest = { version: "여름 이벤트 릴리즈", build: "33" };
    const prod = [{ channel: "production", version: "안정화 배포", build: "33", state: "live" }];
    expect(channelPropagation(prod, latest, "android")).toEqual({ status: "latest" });
  });

  it("flags behind by versionCode, reporting the channel's own newest entry", () => {
    const latest = { version: "0.1.18", build: "33" };
    const prod = [{ channel: "production", version: "0.1.16", build: "30", state: "live" }];
    expect(channelPropagation(prod, latest, "android")).toEqual({
      status: "behind",
      version: "0.1.16",
      build: "30",
    });
  });

  it("ios keeps version-first ordering (build numbers may restart per version)", () => {
    const entries = [
      { channel: "production", version: "0.1.17", build: null, state: "live" },
      { channel: "beta", version: "0.1.16", build: "99", state: "live" },
    ];
    expect(latestBundle(entries, "ios")).toEqual({ version: "0.1.17", build: null });
  });
});

describe("compareBuilds — dotted iOS build numbers", () => {
  const { compareBuilds } = propagation;

  it("compares dotted CFBundleVersion values per segment, not lexicographically", () => {
    expect(compareBuilds("1.0.0.9", "1.0.0.10")).toBe(-1);
    expect(compareBuilds("1.0.0.10", "1.0.0.9")).toBe(1);
    expect(compareBuilds("1.0.0.10", "1.0.0.10")).toBe(0);
  });

  it("keeps plain numeric ordering", () => {
    expect(compareBuilds("9", "108")).toBe(-1);
  });
});
