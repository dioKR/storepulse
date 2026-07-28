// Bundle the static dashboard into the CLI's dist/ so the published
// `storepulse` npm package can serve it (`storepulse serve` looks for
// dist/dashboard/ next to its own modules — see packages/cli/src/serve.ts).
// Runs as part of `pnpm build`, after tsc.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../packages/dashboard/src/", import.meta.url));
const dest = fileURLToPath(new URL("../packages/cli/dist/dashboard/", import.meta.url));

if (!existsSync(src)) {
  console.error(`copy-dashboard: ${src} not found`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-dashboard: ${src} -> ${dest}`);
