import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type AppTarget,
  createAscToken,
  createPlayAccessToken,
  DEFAULT_LANG,
  EasGraphqlError,
  fetchEasProject,
  fetchEasViewer,
  type GooglePlayCredentials,
  type Lang,
  PlayTokenExchangeError,
  type UiKey,
  uiString,
} from "@storepulse/core";
import pc from "picocolors";
import { CONFIG_FILE, type ConfigIssue, validateTargets } from "./config.js";

/**
 * `storepulse doctor` — sequential credential & permission diagnosis (issue #6).
 * Automates the 401/403 troubleshooting table: every failure names the exact
 * link of the chain that broke (key file? key id? console invite? storeId?)
 * and prints a one-line fix. All HTTP goes through an injectable fetch so
 * tests can replay each store-side failure mode.
 */

const ASC_API = "https://api.appstoreconnect.apple.com/v1";
const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";

export type CheckStatus = "pass" | "fail" | "skip";

export interface DoctorCheck {
  /** Stable id for tests, e.g. "asc.token" or "play.app:myapp-android" */
  id: string;
  status: CheckStatus;
  /** Localized checklist line */
  label: string;
  /** Localized one-line detail — the diagnosis on failure, reason on skip */
  detail?: string;
  /** Localized one-line remedy, repeated in the summary */
  fix?: string;
}

export interface DoctorSection {
  title: string;
  checks: DoctorCheck[];
}

export interface DoctorReport {
  sections: DoctorSection[];
  /** True when no check failed (skips are fine) */
  ok: boolean;
}

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** All network access goes through this — injectable for tests */
  fetchImpl?: typeof fetch;
  lang?: Lang;
}

const pass = (id: string, label: string, detail?: string): DoctorCheck => ({
  id,
  status: "pass",
  label,
  ...(detail !== undefined && { detail }),
});
const fail = (id: string, label: string, detail: string, fix?: string): DoctorCheck => ({
  id,
  status: "fail",
  label,
  detail,
  ...(fix !== undefined && { fix }),
});
const skip = (id: string, label: string, detail?: string): DoctorCheck => ({
  id,
  status: "skip",
  label,
  ...(detail !== undefined && { detail }),
});

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** True for untouched `storepulse init` template values (XXXXXXXXXX, xxxx-…). */
const isPlaceholder = (value: string): boolean => /^[Xx]+$/.test(value.replace(/-/g, ""));

export async function runDoctorChecks(options: DoctorOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const lang = options.lang ?? DEFAULT_LANG;
  const t = (key: UiKey, params?: Record<string, string | number>) => uiString(key, lang, params);

  // ── [1] config file: exists → parses → fields valid ──────────────
  const configChecks: DoctorCheck[] = [];
  let targets: AppTarget[] | null = null;

  const configPath = resolve(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    configChecks.push(
      fail(
        "config.exists",
        t("doctor.config.exists"),
        t("doctor.config.notFound", { cwd }),
        t("doctor.fix.init"),
      ),
      skip("config.parse", t("doctor.config.parse"), t("doctor.skip.configFirst")),
      skip("config.fields", t("doctor.config.fields"), t("doctor.skip.configFirst")),
    );
  } else {
    configChecks.push(pass("config.exists", t("doctor.config.exists")));
    let raw: unknown;
    let parsed = false;
    try {
      raw = JSON.parse(readFileSync(configPath, "utf8"));
      parsed = true;
      configChecks.push(pass("config.parse", t("doctor.config.parse")));
    } catch (err) {
      configChecks.push(
        fail(
          "config.parse",
          t("doctor.config.parse"),
          t("doctor.config.parseError", { message: errMessage(err) }),
          t("doctor.fix.config"),
        ),
        skip("config.fields", t("doctor.config.fields"), t("doctor.skip.configFirst")),
      );
    }
    if (parsed) {
      const result = validateTargets(raw);
      if ("issue" in result) {
        configChecks.push(
          fail(
            "config.fields",
            t("doctor.config.fields"),
            configIssueDetail(result.issue, lang),
            t("doctor.fix.config"),
          ),
        );
      } else {
        targets = result.targets;
        configChecks.push(
          pass(
            "config.fields",
            t("doctor.config.fields"),
            t("doctor.config.appsCount", { n: targets.length }),
          ),
        );
      }
    }
  }

  const iosTargets = targets?.filter((a) => a.platform === "ios") ?? [];
  const androidTargets = targets?.filter((a) => a.platform === "android") ?? [];
  // Config broken → we can't know which axes matter; check both to be useful.
  const needIos = targets === null || iosTargets.length > 0;
  const needAndroid = targets === null || androidTargets.length > 0;

  // ── [2] secrets: each env var / key file present ─────────────────
  const envChecks: DoctorCheck[] = [];
  if (needIos) {
    envChecks.push(
      envVarCheck("env.ascKeyId", "ASC_KEY_ID", env, t("doctor.fix.envAsc"), t),
      envVarCheck("env.ascIssuerId", "ASC_ISSUER_ID", env, t("doctor.fix.envAsc"), t),
      secretPairCheck(
        "env.ascKey",
        t("doctor.env.ascKey"),
        "ASC_PRIVATE_KEY",
        env,
        cwd,
        t("doctor.fix.envAsc"),
        t,
      ),
    );
  } else {
    envChecks.push(
      skip("env.ascKeyId", "ASC_KEY_ID", t("doctor.skip.noIosApps")),
      skip("env.ascIssuerId", "ASC_ISSUER_ID", t("doctor.skip.noIosApps")),
      skip("env.ascKey", t("doctor.env.ascKey"), t("doctor.skip.noIosApps")),
    );
  }
  if (needAndroid) {
    envChecks.push(
      secretPairCheck(
        "env.playSa",
        t("doctor.env.playSa"),
        "PLAY_SERVICE_ACCOUNT",
        env,
        cwd,
        t("doctor.fix.envPlay"),
        t,
      ),
    );
  } else {
    envChecks.push(skip("env.playSa", t("doctor.env.playSa"), t("doctor.skip.noAndroidApps")));
  }

  const ascEnvOk = envChecks
    .filter((c) => c.id.startsWith("env.asc"))
    .every((c) => c.status === "pass");
  const playEnvOk = envChecks.find((c) => c.id === "env.playSa")?.status === "pass";

  // ── [3] Apple chain: .p8 → JWT → token accepted → each app ───────
  let appleChecks: DoctorCheck[];
  if (targets === null) {
    appleChecks = [skip("asc.chain", t("doctor.skip.configFirst"))];
  } else if (iosTargets.length === 0) {
    appleChecks = [skip("asc.chain", t("doctor.skip.noIosApps"))];
  } else if (!ascEnvOk) {
    appleChecks = [skip("asc.chain", t("doctor.skip.envFirst"))];
  } else {
    appleChecks = await appleChain(iosTargets, env, cwd, fetchImpl, t);
  }

  // ── [4] Google chain: SA JSON → token exchange → each app ────────
  let googleChecks: DoctorCheck[];
  if (targets === null) {
    googleChecks = [skip("play.chain", t("doctor.skip.configFirst"))];
  } else if (androidTargets.length === 0) {
    googleChecks = [skip("play.chain", t("doctor.skip.noAndroidApps"))];
  } else if (!playEnvOk) {
    googleChecks = [skip("play.chain", t("doctor.skip.envFirst"))];
  } else {
    googleChecks = await googleChain(androidTargets, env, cwd, fetchImpl, t);
  }

  // ── [5] Expo (EAS) chain — optional enrichment ───────────────────
  // Skipped entirely when neither side of the pair (EAS_TOKEN in the env,
  // easProjectId in the config) is present — EAS is opt-in, not a failure.
  const easProjectIds = [
    ...new Set((targets ?? []).flatMap((a) => (a.easProjectId ? [a.easProjectId] : []))),
  ];
  const easToken = env.EAS_TOKEN;
  let easChecks: DoctorCheck[];
  if (!easToken && easProjectIds.length === 0) {
    easChecks = [skip("eas.chain", t("doctor.skip.noEas"))];
  } else {
    easChecks = await easChain(easProjectIds, easToken, fetchImpl, t);
  }

  const sections: DoctorSection[] = [
    { title: t("doctor.section.config"), checks: configChecks },
    { title: t("doctor.section.env"), checks: envChecks },
    { title: t("doctor.section.apple"), checks: appleChecks },
    { title: t("doctor.section.google"), checks: googleChecks },
    { title: t("doctor.section.eas"), checks: easChecks },
  ];
  const ok = sections.every((s) => s.checks.every((c) => c.status !== "fail"));
  return { sections, ok };
}

type Translate = (key: UiKey, params?: Record<string, string | number>) => string;

function configIssueDetail(issue: ConfigIssue, lang: Lang): string {
  switch (issue.kind) {
    case "apps-missing":
      return uiString("doctor.config.appsMissing", lang);
    case "field-missing":
      return uiString("doctor.config.fieldMissing", lang, {
        app: JSON.stringify(issue.app),
        field: issue.field,
      });
    case "bad-platform":
      return uiString("doctor.config.badPlatform", lang, { platform: issue.platform });
    case "bad-eas-project-id":
      return uiString("doctor.config.badEasProjectId", lang, { app: JSON.stringify(issue.app) });
    case "bad-eas-app-identifier":
      return uiString("doctor.config.badEasAppIdentifier", lang, {
        app: JSON.stringify(issue.app),
      });
  }
}

/** Plain env var: set + not the init template placeholder. */
function envVarCheck(
  id: string,
  name: string,
  env: NodeJS.ProcessEnv,
  fix: string,
  t: Translate,
): DoctorCheck {
  const value = env[name];
  if (!value) return fail(id, name, t("doctor.env.missing"), fix);
  if (isPlaceholder(value)) return fail(id, name, t("doctor.env.placeholder"), fix);
  return pass(id, name);
}

/** `NAME_PATH` (file must exist) or `NAME_BASE64` secret pair. */
function secretPairCheck(
  id: string,
  label: string,
  name: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  fix: string,
  t: Translate,
): DoctorCheck {
  const path = env[`${name}_PATH`];
  const base64 = env[`${name}_BASE64`];
  if (!path && !base64) return fail(id, label, t("doctor.env.missing"), fix);
  if (path && !existsSync(resolve(cwd, path))) {
    return fail(id, label, t("doctor.env.fileMissing", { path }), fix);
  }
  return pass(id, label);
}

/** Same PATH-wins-over-BASE64 rule as loadConfig; call only after the env check passed. */
function readSecret(name: string, env: NodeJS.ProcessEnv, cwd: string): string {
  const path = env[`${name}_PATH`];
  if (path) return readFileSync(resolve(cwd, path), "utf8");
  return Buffer.from(env[`${name}_BASE64`] ?? "", "base64").toString("utf8");
}

async function appleChain(
  iosTargets: AppTarget[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  fetchImpl: typeof fetch,
  t: Translate,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const creds = {
    keyId: env.ASC_KEY_ID ?? "",
    issuerId: env.ASC_ISSUER_ID ?? "",
    privateKey: readSecret("ASC_PRIVATE_KEY", env, cwd),
  };

  // .p8 parse + JWT signing — no network involved, so a failure here is
  // always a key *file* problem, never an Apple-side rejection.
  let token: string | null = null;
  try {
    token = await createAscToken(creds);
    checks.push(pass("asc.p8", t("doctor.asc.p8")));
  } catch (err) {
    checks.push(
      fail(
        "asc.p8",
        t("doctor.asc.p8"),
        t("doctor.asc.p8Fail", { message: errMessage(err) }),
        t("doctor.fix.p8"),
      ),
    );
  }

  const appLabel = (app: AppTarget) =>
    t("doctor.check.app", { name: app.name, storeId: app.storeId });

  if (token === null) {
    checks.push(skip("asc.token", t("doctor.asc.token"), t("doctor.skip.prevFailed")));
    for (const app of iosTargets) {
      checks.push(skip(`asc.app:${app.key}`, appLabel(app), t("doctor.skip.prevFailed")));
    }
    return checks;
  }

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // Token validity, independent of any specific app: 401 here means the
  // signature itself was rejected (Key ID / Issuer ID mismatch, revoked key).
  let tokenOk = false;
  try {
    const res = await fetchImpl(`${ASC_API}/apps?limit=1`, auth);
    if (res.ok) {
      tokenOk = true;
      checks.push(pass("asc.token", t("doctor.asc.token")));
    } else if (res.status === 401) {
      checks.push(
        fail("asc.token", t("doctor.asc.token"), t("doctor.asc.401"), t("doctor.fix.asc401")),
      );
    } else {
      checks.push(
        fail(
          "asc.token",
          t("doctor.asc.token"),
          t("doctor.asc.status", { status: res.status }),
          t("doctor.fix.asc401"),
        ),
      );
    }
  } catch (err) {
    checks.push(
      fail(
        "asc.token",
        t("doctor.asc.token"),
        t("doctor.fail.network", { message: errMessage(err) }),
        t("doctor.fix.network"),
      ),
    );
  }

  // Each configured ios app: 404 with a valid token = wrong storeId, or the
  // key's role simply cannot see that app.
  for (const app of iosTargets) {
    const id = `asc.app:${app.key}`;
    if (!tokenOk) {
      checks.push(skip(id, appLabel(app), t("doctor.skip.prevFailed")));
      continue;
    }
    try {
      const res = await fetchImpl(`${ASC_API}/apps/${encodeURIComponent(app.storeId)}`, auth);
      if (res.ok) {
        checks.push(pass(id, appLabel(app)));
      } else if (res.status === 404) {
        checks.push(fail(id, appLabel(app), t("doctor.asc.app404"), t("doctor.fix.ascApp")));
      } else {
        checks.push(
          fail(
            id,
            appLabel(app),
            t("doctor.asc.status", { status: res.status }),
            t("doctor.fix.ascApp"),
          ),
        );
      }
    } catch (err) {
      checks.push(
        fail(
          id,
          appLabel(app),
          t("doctor.fail.network", { message: errMessage(err) }),
          t("doctor.fix.network"),
        ),
      );
    }
  }
  return checks;
}

async function googleChain(
  androidTargets: AppTarget[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  fetchImpl: typeof fetch,
  t: Translate,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  // Service account JSON: parseable + has client_email and a PEM private_key.
  let creds: GooglePlayCredentials | null = null;
  try {
    const parsed = JSON.parse(readSecret("PLAY_SERVICE_ACCOUNT", env, cwd));
    const clientEmail = parsed?.client_email;
    const privateKey = parsed?.private_key;
    if (
      typeof clientEmail !== "string" ||
      typeof privateKey !== "string" ||
      !privateKey.includes("BEGIN PRIVATE KEY")
    ) {
      checks.push(
        fail("play.sa", t("doctor.play.sa"), t("doctor.play.saFields"), t("doctor.fix.sa")),
      );
    } else {
      creds = { clientEmail, privateKey };
      checks.push(pass("play.sa", t("doctor.play.sa")));
    }
  } catch (err) {
    checks.push(
      fail(
        "play.sa",
        t("doctor.play.sa"),
        t("doctor.play.saParseFail", { message: errMessage(err) }),
        t("doctor.fix.sa"),
      ),
    );
  }

  const appLabel = (app: AppTarget) =>
    t("doctor.check.app", { name: app.name, storeId: app.storeId });

  // Token exchange: `invalid_grant` in the body = the key no longer exists
  // (deleted/disabled) or the local clock is skewed — Google won't say which.
  let token: string | null = null;
  if (creds === null) {
    checks.push(skip("play.token", t("doctor.play.token"), t("doctor.skip.prevFailed")));
  } else {
    try {
      token = await createPlayAccessToken(creds, fetchImpl);
      checks.push(pass("play.token", t("doctor.play.token")));
    } catch (err) {
      if (err instanceof PlayTokenExchangeError) {
        if (err.body.includes("invalid_grant")) {
          checks.push(
            fail(
              "play.token",
              t("doctor.play.token"),
              t("doctor.play.invalidGrant"),
              t("doctor.fix.invalidGrant"),
            ),
          );
        } else {
          checks.push(
            fail(
              "play.token",
              t("doctor.play.token"),
              t("doctor.play.tokenStatus", { status: err.status }),
              t("doctor.fix.sa"),
            ),
          );
        }
      } else {
        checks.push(
          fail(
            "play.token",
            t("doctor.play.token"),
            t("doctor.fail.network", { message: errMessage(err) }),
            t("doctor.fix.network"),
          ),
        );
      }
    }
  }

  // Each configured android app: edits.insert is the cheapest call that
  // exercises real per-app permissions; delete the edit right away.
  for (const app of androidTargets) {
    const id = `play.app:${app.key}`;
    if (token === null) {
      checks.push(skip(id, appLabel(app), t("doctor.skip.prevFailed")));
      continue;
    }
    const editsUrl = `${PLAY_API}/applications/${encodeURIComponent(app.storeId)}/edits`;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const res = await fetchImpl(editsUrl, { method: "POST", headers });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const editId = (data as { id?: unknown } | null)?.id;
        if (typeof editId === "string") {
          await fetchImpl(`${editsUrl}/${editId}`, { method: "DELETE", headers }).catch(() => {});
        }
        checks.push(pass(id, appLabel(app)));
      } else if (res.status === 403) {
        const body = await res.text().catch(() => "");
        if (/has not been used|disabled/i.test(body)) {
          checks.push(
            fail(id, appLabel(app), t("doctor.play.apiDisabled"), t("doctor.fix.apiDisabled")),
          );
        } else {
          checks.push(
            fail(
              id,
              appLabel(app),
              t("doctor.play.403"),
              t("doctor.fix.play403", { email: creds?.clientEmail ?? "" }),
            ),
          );
        }
      } else if (res.status === 404) {
        checks.push(fail(id, appLabel(app), t("doctor.play.404"), t("doctor.fix.play404")));
      } else {
        checks.push(
          fail(
            id,
            appLabel(app),
            t("doctor.play.status", { status: res.status }),
            t("doctor.fix.play403", { email: creds?.clientEmail ?? "" }),
          ),
        );
      }
    } catch (err) {
      checks.push(
        fail(
          id,
          appLabel(app),
          t("doctor.fail.network", { message: errMessage(err) }),
          t("doctor.fix.network"),
        ),
      );
    }
  }
  return checks;
}

/** 429/5xx = EAS itself is struggling — not a verdict on the token or project. */
const isEasTransient = (err: EasGraphqlError): boolean =>
  err.status !== undefined && (err.status === 429 || err.status >= 500);

/**
 * EAS chain: token present → token accepted (CurrentUser, the same viewer
 * query eas-cli runs) → each configured easProjectId visible to that token.
 * Reached only when the user opted into EAS on at least one side.
 */
async function easChain(
  projectIds: string[],
  token: string | undefined,
  fetchImpl: typeof fetch,
  t: Translate,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const tokenCheck: DoctorCheck = !token
    ? fail("eas.token", "EAS_TOKEN", t("doctor.env.missing"), t("doctor.fix.envEas"))
    : isPlaceholder(token)
      ? fail("eas.token", "EAS_TOKEN", t("doctor.env.placeholder"), t("doctor.fix.envEas"))
      : pass("eas.token", "EAS_TOKEN");
  checks.push(tokenCheck);

  // Token validity, independent of any specific project: a GraphQL error on
  // CurrentUser means EAS rejected the token itself (invalid/revoked).
  let viewerOk = false;
  if (token === undefined || tokenCheck.status !== "pass") {
    checks.push(skip("eas.viewer", t("doctor.eas.viewer"), t("doctor.skip.easTokenFirst")));
  } else {
    try {
      const viewer = await fetchEasViewer(token, fetchImpl);
      viewerOk = true;
      const name = viewer.name ?? viewer.id ?? "?";
      checks.push(pass("eas.viewer", t("doctor.eas.viewer"), t("doctor.eas.viewerAs", { name })));
    } catch (err) {
      if (err instanceof EasGraphqlError) {
        checks.push(
          isEasTransient(err)
            ? fail(
                "eas.viewer",
                t("doctor.eas.viewer"),
                t("doctor.eas.transient", { message: err.message }),
                t("doctor.fix.easTransient"),
              )
            : fail(
                "eas.viewer",
                t("doctor.eas.viewer"),
                t("doctor.eas.viewerFail", { message: err.message }),
                t("doctor.fix.easToken"),
              ),
        );
      } else {
        checks.push(
          fail(
            "eas.viewer",
            t("doctor.eas.viewer"),
            t("doctor.fail.network", { message: errMessage(err) }),
            t("doctor.fix.network"),
          ),
        );
      }
    }
  }

  // Each configured easProjectId: an error with a valid token means a wrong
  // project id, or a project the token's account simply cannot see.
  if (projectIds.length === 0) {
    checks.push(skip("eas.projects", t("doctor.skip.noEasProjects")));
    return checks;
  }
  for (const projectId of projectIds) {
    const id = `eas.project:${projectId}`;
    const label = t("doctor.check.easProject", { projectId });
    if (token === undefined || !viewerOk) {
      checks.push(skip(id, label, t("doctor.skip.prevFailed")));
      continue;
    }
    try {
      const project = await fetchEasProject(token, projectId, fetchImpl);
      checks.push(pass(id, label, project.fullName ?? project.name));
    } catch (err) {
      if (err instanceof EasGraphqlError) {
        checks.push(
          isEasTransient(err)
            ? fail(
                id,
                label,
                t("doctor.eas.transient", { message: err.message }),
                t("doctor.fix.easTransient"),
              )
            : fail(
                id,
                label,
                t("doctor.eas.projectFail", { message: err.message }),
                t("doctor.fix.easProject"),
              ),
        );
      } else {
        checks.push(
          fail(
            id,
            label,
            t("doctor.fail.network", { message: errMessage(err) }),
            t("doctor.fix.network"),
          ),
        );
      }
    }
  }
  return checks;
}

/** ✓/✗/– checklist + [6] summary with one-line fixes and the tutorial link. */
export function renderDoctorReport(report: DoctorReport, lang: Lang = DEFAULT_LANG): string {
  const out: string[] = [""];
  out.push(
    `  ${pc.bold(pc.magenta("storepulse"))} ${pc.dim(`— ${uiString("doctor.title", lang)}`)}`,
  );

  report.sections.forEach((section, i) => {
    out.push("");
    out.push(`  ${pc.bold(`[${i + 1}] ${section.title}`)}`);
    for (const c of section.checks) {
      if (c.status === "pass") {
        out.push(`    ${pc.green("✓")} ${c.label}${c.detail ? pc.dim(` — ${c.detail}`) : ""}`);
      } else if (c.status === "skip") {
        out.push(`    ${pc.dim("–")} ${pc.dim(c.label)}${c.detail ? pc.dim(`  ${c.detail}`) : ""}`);
      } else {
        out.push(`    ${pc.red("✗")} ${c.label}`);
        if (c.detail) out.push(`        ${pc.yellow(c.detail)}`);
      }
    }
  });

  const failures = report.sections.flatMap((s) => s.checks.filter((c) => c.status === "fail"));
  out.push("");
  out.push(
    `  ${pc.bold(`[${report.sections.length + 1}] ${uiString("doctor.section.summary", lang)}`)}`,
  );
  if (failures.length === 0) {
    out.push(`    ${pc.green("✓")} ${uiString("doctor.summary.ok", lang)}`);
  } else {
    out.push(`    ${pc.red("✗")} ${uiString("doctor.summary.fail", lang, { n: failures.length })}`);
    for (const f of failures) {
      out.push(`      ${pc.red("·")} ${f.label} — ${f.fix ?? f.detail ?? ""}`);
    }
    out.push(`    ${pc.dim(uiString("doctor.summary.tutorial", lang))}`);
  }
  out.push("");
  return out.join("\n");
}

/** `storepulse doctor` entry point — prints the report, exit 1 on any failure. */
export async function runDoctor(lang: Lang = DEFAULT_LANG): Promise<void> {
  const report = await runDoctorChecks({ lang });
  console.log(renderDoctorReport(report, lang));
  if (!report.ok) process.exitCode = 1;
}
