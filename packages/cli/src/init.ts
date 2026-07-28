import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LANG, type Lang, uiString } from "@storepulse/core";
import pc from "picocolors";
import { CONFIG_TEMPLATE, ENV_TEMPLATE, GITIGNORE_ENTRIES } from "./templates.js";

/**
 * `storepulse init` — scaffold the two files a fresh workspace needs (issue #9).
 * npx users don't have the repo's *.example.* files, so the templates are
 * embedded in the package (see templates.js). Existing files are never
 * overwritten; .gitignore is patched so credentials can't be committed.
 */

/** Files `storepulse init` scaffolds, in output order. */
export const INIT_FILES = [
  { name: "storepulse.config.json", content: CONFIG_TEMPLATE },
  { name: ".env", content: ENV_TEMPLATE },
] as const;

const GITIGNORE_HEADER = "# storepulse — credentials & local config (added by `storepulse init`)";

export interface InitResult {
  files: { name: string; action: "created" | "skipped" }[];
  gitignore: {
    action: "created" | "appended" | "unchanged";
    /** The patterns written by this run (empty when unchanged). */
    entries: string[];
  };
}

/** Scaffold config + .env + .gitignore in `cwd`. Never overwrites anything. */
export function initWorkspace(cwd = process.cwd()): InitResult {
  const files = INIT_FILES.map(({ name, content }) => {
    const path = join(cwd, name);
    if (existsSync(path)) return { name, action: "skipped" as const };
    // "wx" = exclusive create — throws instead of clobbering a file that
    // appeared between the existsSync check and the write.
    writeFileSync(path, content, { flag: "wx" });
    return { name, action: "created" as const };
  });
  return { files, gitignore: ensureGitignore(cwd) };
}

/**
 * Make sure .gitignore covers every credential pattern: create it when
 * missing, append only the missing patterns when present, touch nothing
 * when it is already complete.
 */
function ensureGitignore(cwd: string): InitResult["gitignore"] {
  const path = join(cwd, ".gitignore");
  const block = (entries: readonly string[]) => `${GITIGNORE_HEADER}\n${entries.join("\n")}\n`;

  if (!existsSync(path)) {
    writeFileSync(path, block(GITIGNORE_ENTRIES), { flag: "wx" });
    return { action: "created", entries: [...GITIGNORE_ENTRIES] };
  }

  const current = readFileSync(path, "utf8");
  const lines = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.has(entry));
  if (missing.length === 0) return { action: "unchanged", entries: [] };

  const closingNewline = current === "" || current.endsWith("\n") ? "" : "\n";
  const blankSeparator = current.trim() === "" ? "" : "\n";
  appendFileSync(path, `${closingNewline}${blankSeparator}${block(missing)}`);
  return { action: "appended", entries: missing };
}

/** Human-readable report: what happened to each file, then the next steps. */
export function renderInitReport(result: InitResult, lang: Lang = DEFAULT_LANG): string {
  const created = (text: string) => `  ${pc.green("+")} ${text}`;
  const warned = (text: string) => `  ${pc.yellow("!")} ${text}`;

  const out: string[] = [""];
  for (const { name, action } of result.files) {
    out.push(
      action === "created"
        ? created(uiString("init.created", lang, { file: name }))
        : warned(uiString("init.skipped", lang, { file: name })),
    );
  }

  const { action, entries } = result.gitignore;
  if (action === "created") {
    out.push(created(uiString("init.gitignoreCreated", lang, { entries: entries.join(", ") })));
  } else if (action === "appended") {
    out.push(created(uiString("init.gitignoreAppended", lang, { entries: entries.join(", ") })));
  } else {
    out.push(`  ${pc.dim("·")} ${pc.dim(uiString("init.gitignoreUnchanged", lang))}`);
  }

  out.push("");
  out.push(`  ${pc.bold(uiString("init.nextSteps", lang))}`);
  out.push(`    1. ${uiString("init.stepConfig", lang)}`);
  out.push(`    2. ${uiString("init.stepKeys", lang)}`);
  out.push(`    3. ${uiString("init.stepRun", lang)}`);
  out.push("");
  return out.join("\n");
}

/** `storepulse init` entry point. */
export function runInit(lang: Lang = DEFAULT_LANG): void {
  console.log(renderInitReport(initWorkspace(), lang));
}
