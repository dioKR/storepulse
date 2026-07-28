#!/usr/bin/env node
import { fetchAll } from "@storepulse/core";
import { loadConfig } from "./config.js";
import { demoConnector, demoTargets } from "./demo.js";
import { renderBoard } from "./render.js";
import { runServe } from "./serve.js";
import { runSnapshot } from "./snapshot.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, real credentials may come from the environment
}

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === "demo") {
    console.log(renderBoard(await fetchAll([demoConnector], demoTargets)));
  } else if (command === "snapshot") {
    await runSnapshot(rest);
  } else if (command === "serve") {
    await runServe(rest);
  } else if (command === undefined) {
    const { connectors, targets } = loadConfig();
    console.log(renderBoard(await fetchAll(connectors, targets)));
  } else {
    console.error(
      `\nUnknown command "${command}".\n\n` +
        `  storepulse           show the release board for storepulse.config.json\n` +
        `  storepulse demo      show the board with sample data (no credentials needed)\n` +
        `  storepulse snapshot  print the board as JSON (--demo, --out <file>)\n` +
        `  storepulse serve     local web dashboard (--demo, --port, --host, --refresh)\n`,
    );
    process.exit(1);
  }
} catch (err) {
  console.error(`\nstorepulse: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
