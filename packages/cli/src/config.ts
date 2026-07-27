import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AppTarget,
  AscConnector,
  GooglePlayConnector,
  type StoreConnector,
} from "@storepulse/core";

const CONFIG_FILE = "storepulse.config.json";

export interface CliConfig {
  targets: AppTarget[];
  connectors: StoreConnector[];
}

/**
 * App list comes from storepulse.config.json (structure),
 * secrets come from the environment (.env) — never the other way around.
 */
export function loadConfig(cwd = process.cwd()): CliConfig {
  const configPath = resolve(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    throw new Error(
      `${CONFIG_FILE} not found in ${cwd}.\n` +
        `  Copy storepulse.config.example.json to get started,\n` +
        `  or run \`storepulse demo\` to see what the board looks like.`,
    );
  }

  const targets = parseTargets(configPath);
  const connectors: StoreConnector[] = [];

  if (targets.some((t) => t.platform === "ios")) {
    connectors.push(new AscConnector(ascCredentialsFromEnv()));
  }
  if (targets.some((t) => t.platform === "android")) {
    connectors.push(new GooglePlayConnector(playCredentialsFromEnv()));
  }

  return { targets, connectors };
}

function parseTargets(configPath: string): AppTarget[] {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const apps = raw.apps;
  if (!Array.isArray(apps) || apps.length === 0) {
    throw new Error(`${CONFIG_FILE} must contain a non-empty "apps" array`);
  }
  for (const app of apps) {
    for (const field of ["key", "name", "platform", "storeId"]) {
      if (typeof app[field] !== "string" || app[field] === "") {
        throw new Error(`${CONFIG_FILE}: app entry ${JSON.stringify(app)} is missing "${field}"`);
      }
    }
    if (app.platform !== "ios" && app.platform !== "android") {
      throw new Error(`${CONFIG_FILE}: platform must be "ios" or "android", got "${app.platform}"`);
    }
  }
  return apps;
}

function ascCredentialsFromEnv() {
  const keyId = requireEnv("ASC_KEY_ID", "an ios app is configured");
  const issuerId = requireEnv("ASC_ISSUER_ID", "an ios app is configured");
  const privateKey = secretFromEnv("ASC_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("Set ASC_PRIVATE_KEY_PATH (path to your .p8 file) or ASC_PRIVATE_KEY_BASE64");
  }
  return { keyId, issuerId, privateKey };
}

function playCredentialsFromEnv() {
  const json = secretFromEnv("PLAY_SERVICE_ACCOUNT");
  if (!json) {
    throw new Error(
      "Set PLAY_SERVICE_ACCOUNT_PATH (path to the service account JSON) or PLAY_SERVICE_ACCOUNT_BASE64",
    );
  }
  const parsed = JSON.parse(json);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("PLAY_SERVICE_ACCOUNT JSON is missing client_email/private_key");
  }
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
}

/** Reads NAME_PATH (file contents) or NAME_BASE64 (decoded), path wins. */
function secretFromEnv(name: string): string | null {
  const path = process.env[`${name}_PATH`];
  if (path) return readFileSync(resolve(path), "utf8");
  const base64 = process.env[`${name}_BASE64`];
  if (base64) return Buffer.from(base64, "base64").toString("utf8");
  return null;
}

function requireEnv(name: string, why: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required because ${why}`);
  return value;
}
