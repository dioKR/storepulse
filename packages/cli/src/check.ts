import { parseArgs } from "node:util";
import {
  type AppStatus,
  type Channel,
  DEFAULT_LANG,
  type Lang,
  type Platform,
  RELEASE_STATES,
  type ReleaseState,
  uiString,
} from "@storepulse/core";
import pc from "picocolors";
import { coloredBadge } from "./render.js";
import { collectStatuses } from "./snapshot.js";

/**
 * `storepulse check --fail-on <states>` — the CI policy gate (issue #51).
 *
 * Exit code contract (pinned by check.test.ts — treat as public API):
 *   0  collection succeeded, no policy violation
 *   1  collection succeeded, at least one policy violation
 *   2  execution error — bad arguments, config/credentials, or any target
 *      that could not be fetched (a gate must not pass on unknown status)
 */
export const EXIT_OK = 0;
export const EXIT_VIOLATION = 1;
export const EXIT_EXECUTION_ERROR = 2;

/** Argument/usage problem — `runCheck` maps it to exit 2, never 1. */
export class CheckUsageError extends Error {}

export interface CheckArgs {
  demo: boolean;
  failOn: ReleaseState[];
  format: "text" | "json";
}

/** One channel entry whose state matches the --fail-on policy. */
export interface CheckViolation {
  key: string;
  app: string;
  platform: Platform;
  group: string | null;
  channel: Channel;
  version: string | null;
  build: string | null;
  state: ReleaseState;
  rawState: string | null;
}

/** One target whose fetch failed — its store state is unknown. */
export interface CheckFetchError {
  key: string;
  app: string;
  platform: Platform;
  error: string;
}

/** The whole check outcome — `--format json` prints exactly this shape. */
export interface CheckReport {
  failOn: ReleaseState[];
  apps: number;
  violations: CheckViolation[];
  errors: CheckFetchError[];
  exitCode: typeof EXIT_OK | typeof EXIT_VIOLATION | typeof EXIT_EXECUTION_ERROR;
}

const isReleaseState = (value: string): value is ReleaseState =>
  (RELEASE_STATES as string[]).includes(value);

export function parseCheckArgs(argv: string[], lang: Lang = DEFAULT_LANG): CheckArgs {
  let values: { demo?: boolean; "fail-on"?: string; format?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        demo: { type: "boolean", default: false },
        "fail-on": { type: "string" },
        format: { type: "string", default: "text" },
      },
    }));
  } catch {
    throw new CheckUsageError(uiString("check.usage", lang));
  }

  const states = (values["fail-on"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (states.length === 0) throw new CheckUsageError(uiString("check.usage", lang));

  const failOn: ReleaseState[] = [];
  for (const state of states) {
    if (!isReleaseState(state)) {
      throw new CheckUsageError(
        uiString("check.invalidFailOn", lang, { value: state, states: RELEASE_STATES.join(", ") }),
      );
    }
    if (!failOn.includes(state)) failOn.push(state);
  }

  if (values.format !== "text" && values.format !== "json") {
    throw new CheckUsageError(
      uiString("check.invalidFormat", lang, { value: values.format ?? "" }),
    );
  }

  return { demo: values.demo ?? false, failOn, format: values.format };
}

/**
 * Apply the policy to fetched statuses. Every matching channel entry of every
 * app becomes a violation; every target with `AppStatus.error` becomes a fetch
 * error. Any fetch error makes the whole run an execution error (exit 2) even
 * when violations were found elsewhere — "collection succeeded" is part of the
 * exit 0/1 contract, and a CI gate must not pass while some states are unknown.
 */
export function evaluateCheck(statuses: AppStatus[], failOn: ReleaseState[]): CheckReport {
  const violations: CheckViolation[] = [];
  const errors: CheckFetchError[] = [];

  for (const status of statuses) {
    const { key, name, platform, group } = status.target;
    if (status.error) {
      errors.push({ key, app: name, platform, error: status.error });
      continue;
    }
    for (const channel of status.channels) {
      if (!failOn.includes(channel.state)) continue;
      violations.push({
        key,
        app: name,
        platform,
        group: group ?? null,
        channel: channel.channel,
        version: channel.version,
        build: channel.build ?? null,
        state: channel.state,
        rawState: channel.rawState ?? null,
      });
    }
  }

  const exitCode =
    errors.length > 0 ? EXIT_EXECUTION_ERROR : violations.length > 0 ? EXIT_VIOLATION : EXIT_OK;
  return { failOn, apps: statuses.length, violations, errors, exitCode };
}

export function renderCheckJson(report: CheckReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderCheckText(report: CheckReport, lang: Lang = DEFAULT_LANG): string {
  const out: string[] = [""];
  out.push(
    `  ${pc.bold(pc.magenta("storepulse check"))}${pc.dim(`  ·  fail-on: ${report.failOn.join(", ")}`)}`,
  );
  out.push("");

  for (const v of report.violations) {
    const label = `${pc.bold(v.app)} ${pc.dim(`(${v.key}, ${v.platform})`)}`;
    const build = v.build ? pc.dim(` (${v.build})`) : "";
    // rawState stays JSON-only — for known states the badge already is the term.
    out.push(
      `  ${pc.red("✗")} ${label}  ${v.channel.toUpperCase()}  ${v.version ?? "?"} ${coloredBadge(v.state)}${build}`,
    );
  }
  for (const e of report.errors) {
    const label = `${pc.bold(e.app)} ${pc.dim(`(${e.key}, ${e.platform})`)}`;
    out.push(
      `  ${pc.red("✗")} ${label}  ${pc.red(`${uiString("cli.errorPrefix", lang)}: ${e.error}`)}`,
    );
  }
  if (report.violations.length > 0 || report.errors.length > 0) out.push("");

  if (report.errors.length > 0) {
    out.push(`  ${pc.red("✗")} ${uiString("check.errors", lang, { n: report.errors.length })}`);
  }
  if (report.violations.length > 0) {
    out.push(
      `  ${pc.red("✗")} ${uiString("check.violations", lang, {
        n: report.violations.length,
        apps: report.apps,
      })}`,
    );
  }
  if (report.exitCode === EXIT_OK) {
    out.push(`  ${pc.green("✓")} ${uiString("check.ok", lang, { apps: report.apps })}`);
  }
  out.push("");
  return out.join("\n");
}

/** `storepulse check --fail-on <state,...> [--demo] [--format text|json]` → exit code. */
export async function runCheck(argv: string[], lang: Lang = DEFAULT_LANG): Promise<number> {
  let statuses: AppStatus[];
  let args: CheckArgs;
  try {
    args = parseCheckArgs(argv, lang);
    statuses = await collectStatuses(args.demo);
  } catch (error) {
    console.error(`\nstorepulse: ${error instanceof Error ? error.message : error}\n`);
    return EXIT_EXECUTION_ERROR;
  }

  const report = evaluateCheck(statuses, args.failOn);
  if (args.format === "json") {
    process.stdout.write(renderCheckJson(report));
  } else {
    console.log(renderCheckText(report, lang));
  }
  return report.exitCode;
}
