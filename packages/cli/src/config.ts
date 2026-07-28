import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AppTarget,
  AscConnector,
  EasEnricher,
  type Enricher,
  GooglePlayConnector,
  type StoreConnector,
} from "@storepulse/core";

export const CONFIG_FILE = "storepulse.config.json";

export interface CliConfig {
  targets: AppTarget[];
  connectors: StoreConnector[];
  /** Post-fetch stages (EAS, …) — empty when nothing is configured for them */
  enrichers: Enricher[];
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

  // EAS is optional enrichment: it runs only when BOTH sides are present —
  // a token in the environment and at least one target with an easProjectId.
  const enrichers: Enricher[] = [];
  const easToken = process.env.EAS_TOKEN;
  if (easToken && targets.some((t) => t.easProjectId)) {
    enrichers.push(new EasEnricher({ token: easToken }));
  }

  return { targets, connectors, enrichers };
}

/**
 * Structured validation outcome — `storepulse doctor` maps each issue kind
 * to a localized diagnosis, `loadConfig` to an English error message.
 */
export type ConfigIssue =
  | { kind: "apps-missing" }
  | { kind: "field-missing"; app: unknown; field: string }
  | { kind: "bad-platform"; platform: string }
  | { kind: "bad-eas-project-id"; app: unknown };

/** Validate the parsed config shape; reports the first issue found. */
export function validateTargets(raw: unknown): { targets: AppTarget[] } | { issue: ConfigIssue } {
  const apps = (raw as { apps?: unknown } | null)?.apps;
  if (!Array.isArray(apps) || apps.length === 0) {
    return { issue: { kind: "apps-missing" } };
  }
  for (const app of apps) {
    for (const field of ["key", "name", "platform", "storeId"]) {
      if (typeof app?.[field] !== "string" || app[field] === "") {
        return { issue: { kind: "field-missing", app, field } };
      }
    }
    if (app.platform !== "ios" && app.platform !== "android") {
      return { issue: { kind: "bad-platform", platform: app.platform } };
    }
    // Optional field, but when present it must be a usable project id.
    if (
      app.easProjectId !== undefined &&
      (typeof app.easProjectId !== "string" || app.easProjectId === "")
    ) {
      return { issue: { kind: "bad-eas-project-id", app } };
    }
  }
  return { targets: apps as AppTarget[] };
}

function parseTargets(configPath: string): AppTarget[] {
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  const result = validateTargets(raw);
  if ("issue" in result) throw new Error(configIssueMessage(result.issue));
  return result.targets;
}

function configIssueMessage(issue: ConfigIssue): string {
  switch (issue.kind) {
    case "apps-missing":
      return `${CONFIG_FILE} must contain a non-empty "apps" array`;
    case "field-missing":
      return `${CONFIG_FILE}: app entry ${JSON.stringify(issue.app)} is missing "${issue.field}"`;
    case "bad-platform":
      return `${CONFIG_FILE}: platform must be "ios" or "android", got "${issue.platform}"`;
    case "bad-eas-project-id":
      return `${CONFIG_FILE}: app entry ${JSON.stringify(issue.app)} has a non-string or empty "easProjectId"`;
  }
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
