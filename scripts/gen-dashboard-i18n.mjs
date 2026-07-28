// Bundle the shared i18n dictionary into the static dashboard.
// The single source lives in packages/core/src/i18n/; the dashboard is plain
// vanilla JS with no build-time TS, so this script exports the dictionary as
// an ES module the SPA imports directly (same idea as copy-dashboard.mjs).
//
// The generated file is committed so `storepulse serve` can serve
// packages/dashboard/src/ straight from the monorepo (tsx dev mode); a vitest
// sync test (packages/core/src/i18n/dashboard-bundle.test.ts) fails when it
// drifts from the source dictionary. Runs as part of `pnpm build`, after tsc.
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const coreDist = new URL("../packages/core/dist/i18n/index.js", import.meta.url);
if (!existsSync(fileURLToPath(coreDist))) {
  console.error("gen-dashboard-i18n: @storepulse/core is not built — run `tsc --build` first");
  process.exit(1);
}

const { STATE_EXPLANATIONS, SUPPORTED_LANGS, UI_STRINGS } = await import(coreDist.href);

const out = `// GENERATED FILE — do not edit by hand.
// Single source: packages/core/src/i18n/ — regenerate with
// \`node scripts/gen-dashboard-i18n.mjs\` (runs automatically in \`pnpm build\`).
export const SUPPORTED_LANGS = ${JSON.stringify(SUPPORTED_LANGS)};
export const STATE_EXPLANATIONS = ${JSON.stringify(STATE_EXPLANATIONS, null, 2)};
export const UI_STRINGS = ${JSON.stringify(UI_STRINGS, null, 2)};
`;

const dest = fileURLToPath(new URL("../packages/dashboard/src/i18n.js", import.meta.url));
writeFileSync(dest, out);
console.log(`gen-dashboard-i18n: dictionary -> ${dest}`);
