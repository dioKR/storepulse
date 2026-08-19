import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type ChannelStatus,
  createSnapshot,
  DEFAULT_LANG,
  diffSnapshots,
  type Lang,
  SNAPSHOT_SCHEMA_VERSION,
  type Snapshot,
  type SnapshotDiff,
  uiString,
} from "@storepulse/core";
import pc from "picocolors";
import { renderChannelStatus } from "./render.js";
import { collectStatuses } from "./snapshot.js";

export interface DiffArgs {
  beforePath: string;
  afterPath?: string;
  demo: boolean;
}

export function parseDiffArgs(argv: string[], lang: Lang = DEFAULT_LANG): DiffArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { demo: { type: "boolean", default: false } },
  });
  if (
    positionals.length < 1 ||
    positionals.length > 2 ||
    (positionals.length === 2 && values.demo)
  ) {
    throw new Error(uiString("diff.usage", lang));
  }
  return {
    beforePath: positionals[0],
    afterPath: positionals[1],
    demo: values.demo,
  };
}

export function readSnapshot(path: string, lang: Lang = DEFAULT_LANG): Snapshot {
  const absolutePath = resolve(path);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(uiString("diff.readFailed", lang, { path: absolutePath, reason }));
  }
  if (!isRecord(value) || value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    const actual = isRecord(value) ? String(value.schemaVersion ?? "?") : "?";
    throw new Error(
      uiString("diff.schemaMismatch", lang, {
        path: absolutePath,
        expected: String(SNAPSHOT_SCHEMA_VERSION),
        actual,
      }),
    );
  }
  if (!isSnapshot(value)) {
    throw new Error(uiString("diff.invalidSnapshot", lang, { path: absolutePath }));
  }
  return value;
}

export function renderSnapshotDiff(diff: SnapshotDiff, lang: Lang = DEFAULT_LANG): string {
  const out = [
    "",
    `  ${pc.bold(pc.magenta("storepulse diff"))}${pc.dim(`  ·  ${diff.beforeGeneratedAt} → ${diff.afterGeneratedAt}`)}`,
    "",
  ];
  if (diff.apps.length === 0) {
    out.push(`  ${pc.green("✓")} ${uiString("diff.noChanges", lang)}`, "");
    return out.join("\n");
  }

  for (const app of diff.apps) {
    const status = app.after ?? app.before;
    const label = status
      ? `${status.target.name} ${pc.dim(`(${app.key}, ${status.target.platform})`)}`
      : app.key;
    const symbol =
      app.kind === "added" ? pc.green("+") : app.kind === "removed" ? pc.red("−") : pc.yellow("~");
    const action =
      app.kind === "added"
        ? uiString("diff.appAdded", lang)
        : app.kind === "removed"
          ? uiString("diff.appRemoved", lang)
          : uiString("diff.appChanged", lang);
    out.push(`  ${symbol} ${pc.bold(label)} ${pc.dim(action)}`);

    if (app.targetChanged && app.before && app.after) {
      const fields = changedFields(app.before.target, app.after.target);
      out.push(
        `      ${pc.yellow("~")} ${uiString("diff.targetChanged", lang)}: ${renderTarget(app.before.target)} → ${renderTarget(app.after.target)} ${pc.dim(uiString("diff.fieldsChanged", lang, { fields }))}`,
      );
    }
    if (app.errorChanged) {
      out.push(
        `      ${pc.yellow("~")} ${uiString("diff.errorChanged", lang)}: ${renderValue(app.before?.error, lang)} → ${renderValue(app.after?.error, lang)}`,
      );
    }
    for (const channel of app.channels) {
      const entry = channel.after ?? channel.before;
      if (!entry) continue;
      const channelName = entry.channel.toUpperCase();
      if (channel.kind === "added" && channel.after) {
        out.push(`      ${pc.green("+")} ${channelName} ${renderChannelStatus(channel.after)}`);
      } else if (channel.kind === "removed" && channel.before) {
        out.push(`      ${pc.red("−")} ${channelName} ${renderChannelStatus(channel.before)}`);
      } else if (channel.before && channel.after) {
        const fields = changedFields(channel.before, channel.after);
        out.push(
          `      ${pc.yellow("~")} ${channelName} ${renderChannelStatus(channel.before)} → ${renderChannelStatus(channel.after)} ${pc.dim(uiString("diff.fieldsChanged", lang, { fields }))}`,
        );
      }
    }
    out.push("");
  }
  return out.join("\n");
}

/** `storepulse diff <before.json> [after.json] [--demo]` */
export async function runDiff(argv: string[], lang: Lang = DEFAULT_LANG): Promise<void> {
  const args = parseDiffArgs(argv, lang);
  const before = readSnapshot(args.beforePath, lang);
  const after = args.afterPath
    ? readSnapshot(args.afterPath, lang)
    : createSnapshot(await collectStatuses(args.demo));
  process.stdout.write(`${renderSnapshotDiff(diffSnapshots(before, after), lang)}\n`);
}

function renderTarget(target: Snapshot["apps"][number]["target"]): string {
  return `${target.name} (${target.key}, ${target.platform}${target.group ? `, ${target.group}` : ""})`;
}

function renderValue(value: string | undefined, lang: Lang): string {
  return value ? pc.red(value) : pc.dim(uiString("diff.noneValue", lang));
}

function changedFields(before: object, after: object): string {
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const keys = [...Object.keys(afterRecord), ...Object.keys(beforeRecord)].filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  return keys
    .filter((key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]))
    .join(", ");
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.generatedAt === "string" &&
    Array.isArray(value.apps) &&
    value.apps.every(
      (app) =>
        isRecord(app) &&
        isTarget(app.target) &&
        typeof app.fetchedAt === "string" &&
        (app.error === undefined || typeof app.error === "string") &&
        Array.isArray(app.channels) &&
        app.channels.every(isChannelStatus),
    )
  );
}

function isTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.name === "string" &&
    (value.platform === "ios" || value.platform === "android") &&
    typeof value.storeId === "string" &&
    optionalString(value.latestTesterUrl) &&
    optionalStringRecord(value.installLinks) &&
    optionalString(value.group) &&
    optionalString(value.easProjectId) &&
    optionalString(value.easAppIdentifier)
  );
}

function isChannelStatus(value: unknown): value is ChannelStatus {
  if (!isRecord(value)) return false;
  return (
    (value.channel === "production" || value.channel === "beta" || value.channel === "internal") &&
    (value.version === null || typeof value.version === "string") &&
    typeof value.state === "string" &&
    RELEASE_STATES.has(value.state) &&
    optionalString(value.build) &&
    optionalString(value.rawState) &&
    optionalNumber(value.rolloutPercent) &&
    optionalString(value.releaseNotes) &&
    optionalString(value.date) &&
    optionalString(value.expiresAt) &&
    (value.eas === undefined ||
      (isRecord(value.eas) && Object.values(value.eas).every(optionalString)))
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function optionalStringRecord(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => typeof entry === "string"))
  );
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RELEASE_STATES = new Set([
  "live",
  "rollout",
  "in-review",
  "pending",
  "rejected",
  "halted",
  "draft",
  "unknown",
]);
