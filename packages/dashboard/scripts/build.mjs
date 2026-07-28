// The dashboard is plain static HTML/CSS/JS — "building" is copying src/ to dist/.
// Kept as a real build step so the artifact contract (dist/ = deployable bundle)
// stays the same if a bundler ever becomes necessary.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });
console.log(`dashboard: copied ${src} -> ${dist}`);
