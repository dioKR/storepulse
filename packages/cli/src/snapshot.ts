import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type AppStatus,
  createSnapshot,
  DEFAULT_LANG,
  enrichAll,
  fetchAll,
  type Lang,
  uiString,
} from "@storepulse/core";
import { loadConfig } from "./config.js";
import { demoConnector, demoTargets } from "./demo.js";

/**
 * Fetch the release board once, from either the demo fixtures or the
 * real connectors configured by storepulse.config.json + .env.
 * Shared by `storepulse snapshot`, `storepulse serve` and the default board.
 */
export async function collectStatuses(demo: boolean): Promise<AppStatus[]> {
  if (demo) return fetchAll([demoConnector], demoTargets);
  const { connectors, targets, enrichers } = loadConfig();
  return enrichAll(enrichers, await fetchAll(connectors, targets));
}

export function renderSnapshotJson(apps: AppStatus[]): string {
  return `${JSON.stringify(createSnapshot(apps), null, 2)}\n`;
}

/** `storepulse snapshot [--demo] [--out <file>]` */
export async function runSnapshot(argv: string[], lang: Lang = DEFAULT_LANG): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      demo: { type: "boolean", default: false },
      out: { type: "string" },
    },
  });

  const json = renderSnapshotJson(await collectStatuses(values.demo));
  if (values.out) {
    const outPath = resolve(values.out);
    writeFileSync(outPath, json);
    console.error(`storepulse: ${uiString("snapshot.written", lang, { path: outPath })}`);
  } else {
    process.stdout.write(json);
  }
}
