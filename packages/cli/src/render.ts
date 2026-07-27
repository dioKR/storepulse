import type { AppStatus, Channel, ChannelStatus } from "@storepulse/core";
import pc from "picocolors";

const CHANNELS: Channel[] = ["production", "beta", "internal"];
const HEADERS = ["APP", "OS", "PRODUCTION", "BETA / TESTFLIGHT", "INTERNAL"];

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const visibleLength = (s: string) => s.replace(ANSI_PATTERN, "").length;
const pad = (s: string, width: number) => s + " ".repeat(width - visibleLength(s));

function badge(c: ChannelStatus): string {
  const version = c.version ?? "?";
  const build = c.build ? pc.dim(` (${c.build})`) : "";
  switch (c.state) {
    case "live":
      return `${version} ${pc.green("LIVE")}${build}`;
    case "rollout":
      return `${version} ${pc.cyan(`${c.rolloutPercent ?? "?"}%`)}${build}`;
    case "in-review":
      return `${version} ${pc.yellow("REVIEW")}${build}`;
    case "pending":
      return `${version} ${pc.blue("PENDING")}${build}`;
    case "rejected":
      return `${version} ${pc.red("REJECTED")}${build}`;
    case "halted":
      return `${version} ${pc.red("HALTED")}${build}`;
    case "draft":
      return `${version} ${pc.dim("draft")}${build}`;
    default: {
      // Unmapped store state (upstream API change?) — make it stand out instead
      // of blending in: gray UNKNOWN badge with the raw store state next to it.
      const raw = c.rawState ? ` ${pc.dim(`(${c.rawState})`)}` : "";
      return `${version} ${pc.inverse(pc.gray(" UNKNOWN "))}${raw}${build}`;
    }
  }
}

function cell(status: AppStatus, channel: Channel): string {
  const entries = status.channels.filter((c) => c.channel === channel);
  if (entries.length === 0) return pc.dim("—");
  return entries.map(badge).join(pc.dim("  ·  "));
}

export function renderBoard(statuses: AppStatus[]): string {
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
  return out.join("\n");
}
