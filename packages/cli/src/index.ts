#!/usr/bin/env node
import { fetchAll, type Lang, uiString } from "@storepulse/core";
import { demoConnector, demoTargets } from "./demo.js";
import { runDiff } from "./diff.js";
import { runDoctor } from "./doctor.js";
import { runExplain } from "./explain.js";
import { runInit } from "./init.js";
import { extractLangFlag, resolveLang } from "./lang.js";
import { renderBoard } from "./render.js";
import { runServe } from "./serve.js";
import { collectStatuses, runSnapshot } from "./snapshot.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, real credentials may come from the environment
}

// `--lang ko|en` works on every command; env/OS locale are the fallbacks (#4).
const { flag, rest: argvRest } = extractLangFlag(process.argv.slice(2));
const lang = resolveLang(flag);
const [command, ...rest] = argvRest;

function usage(unknownCommand: string, l: Lang): string {
  return (
    `\n${uiString("cli.error.unknownCommand", l, { command: unknownCommand })}\n\n` +
    `  storepulse           ${uiString("cli.help.default", l)}\n` +
    `  storepulse init      ${uiString("cli.help.init", l)}\n` +
    `  storepulse demo      ${uiString("cli.help.demo", l)}\n` +
    `  storepulse snapshot  ${uiString("cli.help.snapshot", l)}\n` +
    `  storepulse diff      ${uiString("cli.help.diff", l)}\n` +
    `  storepulse serve     ${uiString("cli.help.serve", l)}\n` +
    `  storepulse explain   ${uiString("cli.help.explain", l)}\n` +
    `  storepulse doctor    ${uiString("cli.help.doctor", l)}\n\n` +
    `  --lang ko|en         ${uiString("cli.help.lang", l)}\n`
  );
}

try {
  if (command === "init") {
    runInit(lang);
  } else if (command === "demo") {
    console.log(renderBoard(await fetchAll([demoConnector], demoTargets), lang));
  } else if (command === "snapshot") {
    await runSnapshot(rest, lang);
  } else if (command === "diff") {
    await runDiff(rest, lang);
  } else if (command === "serve") {
    await runServe(rest, lang);
  } else if (command === "explain") {
    runExplain(rest, lang);
  } else if (command === "doctor") {
    await runDoctor(lang);
  } else if (command === undefined) {
    console.log(renderBoard(await collectStatuses(false), lang));
  } else {
    console.error(usage(command, lang));
    process.exit(1);
  }
} catch (err) {
  console.error(`\nstorepulse: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
