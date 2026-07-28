import {
  DEFAULT_LANG,
  type Lang,
  RELEASE_STATES,
  type ReleaseState,
  STATE_EXPLANATIONS,
  uiString,
} from "@storepulse/core";
import pc from "picocolors";
import { coloredBadge } from "./render.js";

/**
 * `storepulse explain [state]` — the badge glossary (issue #5).
 * All copy comes from the shared dictionary in @storepulse/core, the same
 * one the dashboard's badge-click panel consumes.
 */

const localized = (text: { en: string; ko: string }, lang: Lang) => text[lang];

/** Case-insensitive lookup by state id ("in-review") or badge text ("REVIEW"). */
export function findState(input: string): ReleaseState | null {
  const q = input.toLowerCase();
  for (const state of RELEASE_STATES) {
    if (state === q || STATE_EXPLANATIONS[state].badge.toLowerCase() === q) return state;
  }
  return null;
}

/** Full legend: badge (in its board color), state id, one-line meaning. */
export function renderExplainLegend(lang: Lang = DEFAULT_LANG): string {
  const badgeWidth = Math.max(...RELEASE_STATES.map((s) => STATE_EXPLANATIONS[s].badge.length));
  const idWidth = Math.max(...RELEASE_STATES.map((s) => s.length));

  const out: string[] = [];
  out.push("");
  out.push(
    `  ${pc.bold(pc.magenta("storepulse"))} ${pc.dim(`— ${uiString("explain.title", lang)}`)}`,
  );
  out.push("");
  for (const state of RELEASE_STATES) {
    const info = STATE_EXPLANATIONS[state];
    const badge = coloredBadge(state, info.badge) + " ".repeat(badgeWidth - info.badge.length);
    const id = pc.dim(state.padEnd(idWidth));
    out.push(`  ${badge}   ${id}   ${localized(info.summary, lang)}`);
  }
  out.push("");
  out.push(`  ${pc.dim(uiString("explain.legendHint", lang))}`);
  out.push("");
  return out.join("\n");
}

/** Detail view: meaning, per-store raw states, recommended action. */
export function renderExplainState(state: ReleaseState, lang: Lang = DEFAULT_LANG): string {
  const info = STATE_EXPLANATIONS[state];
  const heading = (key: "explain.meaning" | "explain.rawStates" | "explain.action") =>
    pc.bold(uiString(key, lang));
  const rawList = (list: string[]) => (list.length > 0 ? list.join(", ") : pc.dim("—"));

  const out: string[] = [];
  out.push("");
  out.push(`  ${coloredBadge(state)} ${pc.dim(`— ${state}`)}`);
  out.push("");
  out.push(`  ${heading("explain.meaning")}`);
  out.push(`    ${localized(info.summary, lang)}`);
  out.push(`    ${pc.dim(localized(info.detail, lang))}`);
  out.push("");
  out.push(`  ${heading("explain.rawStates")}`);
  out.push(`    ${pc.dim("iOS")}      ${rawList(info.rawStates.ios)}`);
  out.push(`    ${pc.dim("Android")}  ${rawList(info.rawStates.android)}`);
  out.push("");
  out.push(`  ${heading("explain.action")}`);
  out.push(`    ${localized(info.action, lang)}`);
  out.push("");
  return out.join("\n");
}

/** Unknown state name → point at the list instead of erroring dryly. */
export function renderUnknownState(input: string, lang: Lang = DEFAULT_LANG): string {
  return (
    `\nstorepulse: ${uiString("explain.unknownState", lang, { state: input })}\n` +
    `  ${RELEASE_STATES.join(", ")}\n`
  );
}

/** `storepulse explain` → legend, `storepulse explain <state>` → detail. */
export function runExplain(args: string[], lang: Lang = DEFAULT_LANG): void {
  const [name] = args;
  if (name === undefined) {
    console.log(renderExplainLegend(lang));
    return;
  }
  const state = findState(name);
  if (state === null) {
    console.error(renderUnknownState(name, lang));
    process.exitCode = 1;
    return;
  }
  console.log(renderExplainState(state, lang));
}
