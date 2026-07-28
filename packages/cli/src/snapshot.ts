import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { type AppStatus, createSnapshot, fetchAll } from "@storepulse/core";
import { loadConfig } from "./config.js";
import { demoConnector, demoTargets } from "./demo.js";

/**
 * Fetch the release board once, from either the demo fixtures or the
 * real connectors configured by storepulse.config.json + .env.
 * Shared by `storepulse snapshot` and `storepulse serve`.
 */
export async function collectStatuses(demo: boolean): Promise<AppStatus[]> {
  if (demo) return fetchAll([demoConnector], demoTargets);
  const { connectors, targets } = loadConfig();
  return fetchAll(connectors, targets);
}

export function renderSnapshotJson(apps: AppStatus[]): string {
  return `${JSON.stringify(createSnapshot(apps), null, 2)}\n`;
}

/** `storepulse snapshot [--demo] [--out <file>]` */
export async function runSnapshot(argv: string[]): Promise<void> {
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
    console.error(`storepulse: snapshot written to ${outPath}`);
  } else {
    process.stdout.write(json);
  }
}
