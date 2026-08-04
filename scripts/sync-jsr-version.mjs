import { readFile, writeFile } from "node:fs/promises";

const packageJsonPath = new URL("../packages/core/package.json", import.meta.url);
const jsrJsonPath = new URL("../packages/core/jsr.json", import.meta.url);

const [packageJson, jsrJsonSource] = await Promise.all([
  readJson(packageJsonPath),
  readFile(jsrJsonPath, "utf8"),
]);
const jsrJson = JSON.parse(jsrJsonSource);

if (packageJson.name !== jsrJson.name) {
  throw new Error(
    `Refusing to sync mismatched package names: ${packageJson.name} and ${jsrJson.name}.`,
  );
}

if (packageJson.version === jsrJson.version) {
  console.log(`JSR version is already ${packageJson.version}.`);
} else {
  await writeFile(jsrJsonPath, replaceVersion(jsrJsonSource, packageJson.version));
  console.log(`Synced JSR version to ${packageJson.version}.`);
}

function replaceVersion(source, version) {
  const next = source.replace(/^(\s*"version"\s*:\s*)"[^"]*"(?=,?\s*$)/m, `$1"${version}"`);
  if (next === source) throw new Error("JSR config is missing a top-level version field.");
  return next;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
