import { readFile } from "node:fs/promises";

const packageJsonPath = new URL("../packages/core/package.json", import.meta.url);
const jsrJsonPath = new URL("../packages/core/jsr.json", import.meta.url);

const [packageJson, jsrJson] = await Promise.all([
  readJson(packageJsonPath),
  readJson(jsrJsonPath),
]);

if (packageJson.name !== jsrJson.name) {
  throw new Error(
    `JSR package name (${jsrJson.name}) must match package.json (${packageJson.name}).`,
  );
}

if (packageJson.version !== jsrJson.version) {
  throw new Error(
    `JSR version (${jsrJson.version}) must match package.json (${packageJson.version}). Run pnpm jsr:sync-version.`,
  );
}

if (jsrJson.exports !== "./src/index.ts") {
  throw new Error("JSR must export the TypeScript source entrypoint: ./src/index.ts.");
}

console.log(`JSR config is valid for ${packageJson.name}@${packageJson.version}.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
