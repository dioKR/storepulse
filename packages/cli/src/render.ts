import {
  type AppStatus,
  type BadgeColor,
  type Channel,
  type ChannelStatus,
  DEFAULT_LANG,
  type Lang,
  type ReleaseState,
  STATE_EXPLANATIONS,
  uiString,
} from "@storepulse/core";
import pc from "picocolors";

const CHANNELS: Channel[] = ["production", "beta", "internal"];
// Column headers stay English on purpose — fixed terms keep the column widths stable.
const HEADERS = ["APP", "OS", "PRODUCTION", "BETA / TESTFLIGHT", "INTERNAL"];

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const visibleLength = (s: string) => s.replace(ANSI_PATTERN, "").length;
const pad = (s: string, width: number) => s + " ".repeat(width - visibleLength(s));

/** ANSI paint per dictionary badge color ("gray" = the inverse UNKNOWN look). */
const BADGE_PAINT: Record<BadgeColor, (s: string) => string> = {
  green: pc.green,
  cyan: pc.cyan,
  yellow: pc.yellow,
  blue: pc.blue,
  red: pc.red,
  dim: pc.dim,
  gray: (s) => pc.inverse(pc.gray(s)),
};

/** Badge text + color for a known state, exactly as the board prints it. */
export function coloredBadge(state: ReleaseState, text?: string): string {
  const info = STATE_EXPLANATIONS[state];
  const label = text ?? (state === "unknown" ? ` ${info.badge} ` : info.badge);
  return BADGE_PAINT[info.color](label);
}

function badge(c: ChannelStatus): string {
  const version = c.version ?? "?";
  const build = c.build ? pc.dim(` (${c.build})`) : "";
  if (c.state === "rollout") {
    return `${version} ${coloredBadge("rollout", `${c.rolloutPercent ?? "?"}%`)}${build}`;
  }
  if (Object.hasOwn(STATE_EXPLANATIONS, c.state) && c.state !== "unknown") {
    return `${version} ${coloredBadge(c.state)}${build}`;
  }
  // Unmapped store state (upstream API change?) — make it stand out instead
  // of blending in: gray UNKNOWN badge with the raw store state next to it.
  const raw = c.rawState ? ` ${pc.dim(`(${c.rawState})`)}` : "";
  return `${version} ${coloredBadge("unknown")}${raw}${build}`;
}

function cell(status: AppStatus, channel: Channel): string {
  const entries = status.channels.filter((c) => c.channel === channel);
  if (entries.length === 0) return pc.dim("—");
  return entries.map(badge).join(pc.dim("  ·  "));
}

export function renderBoard(statuses: AppStatus[], lang: Lang = DEFAULT_LANG): string {
  const rows = statuses.map((s) => {
    const app = s.target.group
      ? `${s.target.name} ${pc.dim(`[${s.target.group}]`)}`
      : s.target.name;
    const os = s.target.platform === "ios" ? "iOS" : "Android";
    if (s.error) {
      return [app, os, pc.red(`error: ${s.error}`), "", ""];
    }
    return [app, os, ...CHANNELS.map((ch) => cell(s, ch))];
  });

  const table = [HEADERS.map((h) => pc.bold(h)), ...rows];
  const widths = HEADERS.map((_, col) =>
    Math.max(...table.map((row) => visibleLength(row[col] ?? ""))),
  );

  const line = (row: string[]) => `  ${row.map((c, i) => pad(c ?? "", widths[i])).join("   ")}`;

  const out: string[] = [];
  out.push("");
  out.push(
    `  ${pc.bold(pc.magenta("storepulse"))}${pc.dim(`  ·  ${new Date().toLocaleString()}`)}`,
  );
  out.push("");
  out.push(line(table[0]));
  out.push(`  ${pc.dim("─".repeat(widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3))}`);

  let prevApp = "";
  for (let i = 1; i < table.length; i++) {
    const appCell = table[i][0];
    // Visually group ios/android rows of the same app
    if (appCell === prevApp) table[i][0] = "";
    else prevApp = appCell;
    out.push(line(table[i]));
  }
  out.push("");
  out.push(`  ${pc.dim(uiString("cli.hint.explain", lang))}`);
  out.push("");
  return out.join("\n");
}
