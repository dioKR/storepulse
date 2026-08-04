import { readFile, writeFile } from "node:fs/promises";

const packageJsonPath = new URL("../packages/core/package.json", import.meta.url);
const jsrJsonPath = new URL("../packages/core/jsr.json", import.meta.url);

const [packageJson, jsrJson] = await Promise.all([
  readJson(packageJsonPath),
  readJson(jsrJsonPath),
]);

if (packageJson.name !== jsrJson.name) {
  throw new Error(
    `Refusing to sync mismatched package names: ${packageJson.name} and ${jsrJson.name}.`,
  );
}

if (packageJson.version === jsrJson.version) {
  console.log(`JSR version is already ${packageJson.version}.`);
} else {
  jsrJson.version = packageJson.version;
  await writeFile(jsrJsonPath, `${JSON.stringify(jsrJson, null, 2)}\n`);
  console.log(`Synced JSR version to ${packageJson.version}.`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
