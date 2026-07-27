#!/usr/bin/env node
import { fetchAll } from "@storepulse/core";
import { loadConfig } from "./config.js";
import { demoConnector, demoTargets } from "./demo.js";
import { renderBoard } from "./render.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, real credentials may come from the environment
}

const command = process.argv[2];

if (command === "demo") {
  console.log(renderBoard(await fetchAll([demoConnector], demoTargets)));
} else if (command === undefined) {
  try {
    const { connectors, targets } = loadConfig();
    console.log(renderBoard(await fetchAll(connectors, targets)));
  } catch (err) {
    console.error(`\nstorepulse: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
} else {
  console.error(
    `\nUnknown command "${command}".\n\n` +
      `  storepulse        show the release board for storepulse.config.json\n` +
      `  storepulse demo   show the board with sample data (no credentials needed)\n`,
  );
  process.exit(1);
}
