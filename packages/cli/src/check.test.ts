import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppStatus } from "@storepulse/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckUsageError,
  EXIT_EXECUTION_ERROR,
  EXIT_OK,
  EXIT_VIOLATION,
  evaluateCheck,
  parseCheckArgs,
  renderCheckJson,
  renderCheckText,
  runCheck,
} from "./check.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ── fixtures ─────────────────────────────────────────────────────────

function app(
  key: string,
  overrides: Partial<AppStatus> & { channels?: AppStatus["channels"] } = {},
): AppStatus {
  return {
    target: { key, name: "My App", platform: "ios", storeId: "123" },
    channels: [{ channel: "production", version: "1.0.0", state: "live" }],
    fetchedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── parseCheckArgs ───────────────────────────────────────────────────

describe("parseCheckArgs", () => {
  it("parses states, flags and defaults", () => {
    expect(parseCheckArgs(["--fail-on", "rejected,halted"])).toEqual({
      demo: false,
      failOn: ["rejected", "halted"],
      format: "text",
    });
    expect(parseCheckArgs(["--demo", "--fail-on", "rejected", "--format", "json"])).toEqual({
      demo: true,
      failOn: ["rejected"],
      format: "json",
    });
  });

  it("trims, lowercases and dedupes the state list", () => {
    expect(parseCheckArgs(["--fail-on", " Rejected , HALTED,rejected "]).failOn).toEqual([
      "rejected",
      "halted",
    ]);
  });

  it("requires --fail-on (usage error, localized)", () => {
    expect(() => parseCheckArgs([])).toThrow(CheckUsageError);
    expect(() => parseCheckArgs([])).toThrow("usage: storepulse check --fail-on");
    expect(() => parseCheckArgs(["--fail-on", " , "], "ko")).toThrow("사용법");
  });

  it("rejects unknown states with the valid list", () => {
    expect(() => parseCheckArgs(["--fail-on", "rejected,bogus"])).toThrow(CheckUsageError);
    expect(() => parseCheckArgs(["--fail-on", "bogus"])).toThrow(
      'invalid --fail-on state "bogus" — valid states: ' +
        "live, rollout, in-review, pending, rejected, halted, draft, unknown",
    );
    expect(() => parseCheckArgs(["--fail-on", "bogus"], "ko")).toThrow("사용 가능한 상태");
  });

  it("rejects unknown formats and unknown flags", () => {
    expect(() => parseCheckArgs(["--fail-on", "rejected", "--format", "xml"])).toThrow(
      'invalid --format "xml"',
    );
    expect(() => parseCheckArgs(["--fail-on", "rejected", "--nope"])).toThrow(CheckUsageError);
  });
});

// ── evaluateCheck ────────────────────────────────────────────────────

describe("evaluateCheck", () => {
  it("exits 0 when no channel matches the policy", () => {
    const report = evaluateCheck([app("a-ios")], ["rejected", "halted"]);
    expect(report).toEqual({
      failOn: ["rejected", "halted"],
      apps: 1,
      violations: [],
      errors: [],
      exitCode: EXIT_OK,
    });
  });

  it("only flags states listed in --fail-on", () => {
    const rejected = app("a-ios", {
      channels: [{ channel: "production", version: "1.0.0", state: "rejected" }],
    });
    expect(evaluateCheck([rejected], ["halted"]).exitCode).toBe(EXIT_OK);
    expect(evaluateCheck([rejected], ["rejected"]).exitCode).toBe(EXIT_VIOLATION);
  });

  it("reports every violation of every app, with full identification", () => {
    const statuses: AppStatus[] = [
      {
        target: { key: "a-ios", name: "Aurora", platform: "ios", storeId: "1", group: "prod" },
        channels: [
          { channel: "production", version: "2.0.0", state: "rejected", rawState: "REJECTED" },
          { channel: "beta", version: "2.1.0", build: "42", state: "halted" },
          { channel: "internal", version: "2.1.1", state: "live" },
        ],
        fetchedAt: "2026-08-01T00:00:00.000Z",
      },
      app("b-android", {
        target: { key: "b-android", name: "Borealis", platform: "android", storeId: "com.b" },
        channels: [{ channel: "production", version: null, state: "halted" }],
      }),
    ];

    const report = evaluateCheck(statuses, ["rejected", "halted"]);
    expect(report.exitCode).toBe(EXIT_VIOLATION);
    expect(report.apps).toBe(2);
    expect(report.violations).toEqual([
      {
        key: "a-ios",
        app: "Aurora",
        platform: "ios",
        group: "prod",
        channel: "production",
        version: "2.0.0",
        build: null,
        state: "rejected",
        rawState: "REJECTED",
      },
      {
        key: "a-ios",
        app: "Aurora",
        platform: "ios",
        group: "prod",
        channel: "beta",
        version: "2.1.0",
        build: "42",
        state: "halted",
        rawState: null,
      },
      {
        key: "b-android",
        app: "Borealis",
        platform: "android",
        group: null,
        channel: "production",
        version: null,
        build: null,
        state: "halted",
        rawState: null,
      },
    ]);
  });

  it("treats any fetch failure as an execution error, even alongside violations", () => {
    const statuses: AppStatus[] = [
      app("ok-ios", {
        channels: [{ channel: "production", version: "1.0.0", state: "rejected" }],
      }),
      app("bad-ios", {
        target: { key: "bad-ios", name: "Broken", platform: "ios", storeId: "9" },
        channels: [],
        error: "ASC API returned 401",
      }),
    ];

    const report = evaluateCheck(statuses, ["rejected"]);
    expect(report.exitCode).toBe(EXIT_EXECUTION_ERROR);
    expect(report.errors).toEqual([
      { key: "bad-ios", app: "Broken", platform: "ios", error: "ASC API returned 401" },
    ]);
    // The violations we could establish are still reported.
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.key).toBe("ok-ios");
  });
});

// ── output formats ───────────────────────────────────────────────────

describe("renderCheckJson", () => {
  it("pins the machine-readable schema", () => {
    const statuses: AppStatus[] = [
      app("a-ios", {
        channels: [{ channel: "production", version: "1.0.0", state: "rejected" }],
      }),
      app("bad-ios", { channels: [], error: "boom" }),
    ];
    const parsed = JSON.parse(renderCheckJson(evaluateCheck(statuses, ["rejected"])));

    expect(Object.keys(parsed)).toEqual(["failOn", "apps", "violations", "errors", "exitCode"]);
    expect(Object.keys(parsed.violations[0])).toEqual([
      "key",
      "app",
      "platform",
      "group",
      "channel",
      "version",
      "build",
      "state",
      "rawState",
    ]);
    expect(Object.keys(parsed.errors[0])).toEqual(["key", "app", "platform", "error"]);
    expect(parsed.failOn).toEqual(["rejected"]);
    expect(parsed.apps).toBe(2);
    expect(parsed.exitCode).toBe(EXIT_EXECUTION_ERROR);
  });
});

describe("renderCheckText", () => {
  it("lists violations with fixed English terms and a localized summary", () => {
    const statuses: AppStatus[] = [
      app("a-ios", {
        target: { key: "a-ios", name: "Aurora", platform: "ios", storeId: "1" },
        channels: [{ channel: "production", version: "2.0.0", build: "42", state: "rejected" }],
      }),
    ];
    const text = renderCheckText(evaluateCheck(statuses, ["rejected"]), "ko");

    expect(text).toContain("fail-on: rejected");
    expect(text).toContain("Aurora");
    expect(text).toContain("(a-ios, ios)");
    expect(text).toContain("PRODUCTION");
    expect(text).toContain("2.0.0");
    expect(text).toContain("REJECTED");
    expect(text).toContain("(42)");
    expect(text).toContain("앱 1개 중 정책 위반 1건");
  });

  it("explains fetch failures and the conservative gate in the selected language", () => {
    const statuses = [app("bad-ios", { channels: [], error: "ASC API returned 401" })];
    const en = renderCheckText(evaluateCheck(statuses, ["rejected"]), "en");
    expect(en).toContain("error: ASC API returned 401");
    expect(en).toContain("1 app(s) could not be checked");

    const ko = renderCheckText(evaluateCheck(statuses, ["rejected"]), "ko");
    expect(ko).toContain("앱 1개를 조회하지 못했습니다");
  });

  it("confirms a clean run", () => {
    const text = renderCheckText(evaluateCheck([app("a-ios")], ["rejected"]), "en");
    expect(text).toContain("no policy violations — 1 app(s) checked");
  });
});

// ── runCheck — the exit code contract, end to end ────────────────────

describe("runCheck", () => {
  it("exits 1 on demo data with --fail-on rejected and lists the violation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runCheck(["--demo", "--fail-on", "rejected"])).resolves.toBe(EXIT_VIOLATION);
    const text = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(text).toContain("Borealis");
    expect(text).toContain("REJECTED");
  });

  it("exits 0 on demo data with --fail-on halted", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runCheck(["--demo", "--fail-on", "halted"])).resolves.toBe(EXIT_OK);
  });

  it("prints parseable JSON with --format json", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    await expect(runCheck(["--demo", "--fail-on", "rejected", "--format", "json"])).resolves.toBe(
      EXIT_VIOLATION,
    );

    const parsed = JSON.parse(chunks.join(""));
    expect(parsed.exitCode).toBe(EXIT_VIOLATION);
    expect(parsed.violations).toEqual([
      expect.objectContaining({
        key: "borealis-ios",
        app: "Borealis",
        platform: "ios",
        channel: "production",
        version: "1.9.3",
        state: "rejected",
      }),
    ]);
  });

  it("exits 2 on an invalid --fail-on value and names the valid states", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runCheck(["--demo", "--fail-on", "bogus"])).resolves.toBe(EXIT_EXECUTION_ERROR);
    expect(error.mock.calls.join("\n")).toContain("valid states: live, rollout");
  });

  it("exits 2 when the config cannot be loaded (no storepulse.config.json)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "storepulse-check-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(runCheck(["--fail-on", "rejected"])).resolves.toBe(EXIT_EXECUTION_ERROR);
      expect(error.mock.calls.join("\n")).toContain("storepulse.config.json not found");
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
