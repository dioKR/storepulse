import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPPORTED_LANGS, UI_STRINGS, type UiKey, uiString } from "@storepulse/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DoctorReport, renderDoctorReport, runDoctorChecks } from "./doctor.js";

// ── fixtures ─────────────────────────────────────────────────────────

const ES256_PEM = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
const RS256_PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;

const SA_EMAIL = "sa@project.iam.gserviceaccount.com";
const SA_JSON = JSON.stringify({ client_email: SA_EMAIL, private_key: RS256_PEM });

const iosApp = { key: "app-ios", name: "MyApp", platform: "ios", storeId: "123" };
const androidApp = {
  key: "app-android",
  name: "MyApp",
  platform: "android",
  storeId: "com.example.app",
};

const ascEnv = {
  ASC_KEY_ID: "ABC123DEFG",
  ASC_ISSUER_ID: "57246542-96fe-1a63-e053-0824d011072a",
  ASC_PRIVATE_KEY_BASE64: Buffer.from(ES256_PEM).toString("base64"),
};
const playEnv = {
  PLAY_SERVICE_ACCOUNT_BASE64: Buffer.from(SA_JSON).toString("base64"),
};

const tempDirs: string[] = [];
/** Temp dir, optionally with a storepulse.config.json holding `apps`. */
function makeDir(apps?: unknown, rawConfig?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "storepulse-doctor-"));
  tempDirs.push(dir);
  if (rawConfig !== undefined) {
    writeFileSync(join(dir, "storepulse.config.json"), rawConfig);
  } else if (apps !== undefined) {
    writeFileSync(join(dir, "storepulse.config.json"), JSON.stringify({ apps }));
  }
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/** Route-table fetch mock; records every call for assertions. */
function mockFetch(
  routes: (
    url: string,
    init?: { method?: string },
  ) => {
    status: number;
    body?: unknown;
    text?: string;
  },
) {
  const calls: { url: string; method: string }[] = [];
  const fn = vi.fn(async (url: unknown, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const r = routes(String(url), init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
      text: async () => r.text ?? JSON.stringify(r.body ?? {}),
    };
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const neverFetch = (() => {
  throw new Error("doctor must not touch the network in this scenario");
}) as unknown as typeof fetch;

function byId(report: DoctorReport, id: string) {
  for (const section of report.sections) {
    const check = section.checks.find((c) => c.id === id);
    if (check) return check;
  }
  throw new Error(`check "${id}" not in report`);
}

const en = (key: UiKey, params?: Record<string, string | number>) => uiString(key, "en", params);

// ── [1] config ───────────────────────────────────────────────────────

describe("doctor — config checks", () => {
  it("empty folder: config missing fails, everything downstream skips, no network", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir(),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    expect(report.ok).toBe(false);
    expect(byId(report, "config.exists").status).toBe("fail");
    expect(byId(report, "config.exists").fix).toBe(en("doctor.fix.init"));
    expect(byId(report, "config.parse").status).toBe("skip");
    expect(byId(report, "config.fields").status).toBe("skip");
    // config unknown → env presence still reported for both axes
    expect(byId(report, "env.ascKeyId").status).toBe("fail");
    expect(byId(report, "env.playSa").status).toBe("fail");
    expect(byId(report, "asc.chain").status).toBe("skip");
    expect(byId(report, "play.chain").status).toBe("skip");
  });

  it("broken JSON: parse fails with the parser message", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir(undefined, "{ apps: ["),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    expect(byId(report, "config.exists").status).toBe("pass");
    expect(byId(report, "config.parse").status).toBe("fail");
    expect(byId(report, "config.parse").detail).toContain("JSON parse failed");
    expect(byId(report, "config.fields").status).toBe("skip");
    expect(report.ok).toBe(false);
  });

  it("missing field: names the field and the offending entry", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([{ key: "a", name: "A", platform: "ios" }]),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    const fields = byId(report, "config.fields");
    expect(fields.status).toBe("fail");
    expect(fields.detail).toContain('"storeId"');
    expect(fields.detail).toContain('"key":"a"');
  });

  it("bad platform: names the bogus value", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([{ key: "a", name: "A", platform: "web", storeId: "x" }]),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    expect(byId(report, "config.fields").detail).toContain('"web"');
  });
});

// ── [2] secrets ──────────────────────────────────────────────────────

describe("doctor — secrets checks", () => {
  it("missing env vars fail per variable; both chains wait for [2]", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp, androidApp]),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    for (const id of ["env.ascKeyId", "env.ascIssuerId", "env.ascKey", "env.playSa"]) {
      expect(byId(report, id).status, id).toBe("fail");
      expect(byId(report, id).detail, id).toBe(en("doctor.env.missing"));
    }
    expect(byId(report, "asc.chain").detail ?? byId(report, "asc.chain").label).toBe(
      en("doctor.skip.envFirst"),
    );
    expect(byId(report, "play.chain").status).toBe("skip");
  });

  it("flags untouched `storepulse init` placeholders", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: {
        ASC_KEY_ID: "XXXXXXXXXX",
        ASC_ISSUER_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        ASC_PRIVATE_KEY_BASE64: ascEnv.ASC_PRIVATE_KEY_BASE64,
      },
      fetchImpl: neverFetch,
      lang: "en",
    });

    expect(byId(report, "env.ascKeyId").detail).toBe(en("doctor.env.placeholder"));
    expect(byId(report, "env.ascIssuerId").detail).toBe(en("doctor.env.placeholder"));
  });

  it("fails when the key PATH points at a missing file", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: {
        ...ascEnv,
        ASC_PRIVATE_KEY_BASE64: undefined,
        ASC_PRIVATE_KEY_PATH: "./AuthKey_XXXXXXXXXX.p8",
      },
      fetchImpl: neverFetch,
      lang: "en",
    });

    const key = byId(report, "env.ascKey");
    expect(key.status).toBe("fail");
    expect(key.detail).toContain("./AuthKey_XXXXXXXXXX.p8");
  });

  it("skips the android axis (env + chain) when the config has no android apps", async () => {
    const { fn } = mockFetch(() => ({ status: 200, body: { data: [] } }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "env.playSa").status).toBe("skip");
    expect(byId(report, "env.playSa").detail).toBe(en("doctor.skip.noAndroidApps"));
    expect(byId(report, "play.chain").status).toBe("skip");
    // healthy ios chain → overall ok despite the skipped axis
    expect(byId(report, "asc.p8").status).toBe("pass");
    expect(byId(report, "asc.token").status).toBe("pass");
    expect(byId(report, "asc.app:app-ios").status).toBe("pass");
    expect(report.ok).toBe(true);
  });
});

// ── [3] Apple chain ──────────────────────────────────────────────────

describe("doctor — App Store Connect chain", () => {
  it("broken .p8 → key-file diagnosis, no network call at all", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200 }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: { ...ascEnv, ASC_PRIVATE_KEY_BASE64: Buffer.from("garbage").toString("base64") },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "asc.p8").status).toBe("fail");
    expect(byId(report, "asc.p8").fix).toBe(en("doctor.fix.p8"));
    expect(byId(report, "asc.token").status).toBe("skip");
    expect(byId(report, "asc.app:app-ios").status).toBe("skip");
    expect(calls).toHaveLength(0);
  });

  it("401 on GET /v1/apps → Key ID / Issuer ID / revoked-key diagnosis", async () => {
    const { fn } = mockFetch(() => ({ status: 401, body: {} }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "asc.p8").status).toBe("pass");
    expect(byId(report, "asc.token").status).toBe("fail");
    expect(byId(report, "asc.token").detail).toBe(en("doctor.asc.401"));
    expect(byId(report, "asc.token").fix).toBe(en("doctor.fix.asc401"));
    expect(byId(report, "asc.app:app-ios").status).toBe("skip");
  });

  it("valid token but app 404 → storeId / key-role diagnosis for that app only", async () => {
    const { fn } = mockFetch((url) =>
      url.includes("/apps/123") ? { status: 404 } : { status: 200, body: { data: [] } },
    );
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp, { ...iosApp, key: "ok-ios", storeId: "456" }]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "asc.token").status).toBe("pass");
    expect(byId(report, "asc.app:app-ios").status).toBe("fail");
    expect(byId(report, "asc.app:app-ios").detail).toBe(en("doctor.asc.app404"));
    expect(byId(report, "asc.app:ok-ios").status).toBe("pass");
    expect(report.ok).toBe(false);
  });

  it("network failure surfaces as a network diagnosis, not a crash", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: ascEnv,
      fetchImpl: (() => {
        throw new Error("getaddrinfo ENOTFOUND");
      }) as unknown as typeof fetch,
      lang: "en",
    });

    expect(byId(report, "asc.token").status).toBe("fail");
    expect(byId(report, "asc.token").detail).toContain("getaddrinfo ENOTFOUND");
    expect(byId(report, "asc.token").fix).toBe(en("doctor.fix.network"));
  });
});

// ── [4] Google Play chain ────────────────────────────────────────────

const TOKEN_URL = "https://oauth2.googleapis.com/token";

describe("doctor — Google Play chain", () => {
  const androidDir = () => makeDir([androidApp]);

  it("unparseable service account JSON fails before any network call", async () => {
    const { fn, calls } = mockFetch(() => ({ status: 200 }));
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: { PLAY_SERVICE_ACCOUNT_BASE64: Buffer.from("not-json").toString("base64") },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "play.sa").status).toBe("fail");
    expect(byId(report, "play.sa").fix).toBe(en("doctor.fix.sa"));
    expect(byId(report, "play.token").status).toBe("skip");
    expect(byId(report, "play.app:app-android").status).toBe("skip");
    expect(calls).toHaveLength(0);
  });

  it("service account JSON without client_email/private_key is called out", async () => {
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: {
        PLAY_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({ type: "service_account" }),
        ).toString("base64"),
      },
      fetchImpl: neverFetch,
      lang: "en",
    });

    expect(byId(report, "play.sa").detail).toBe(en("doctor.play.saFields"));
  });

  it("invalid_grant → deleted-key / clock-skew diagnosis", async () => {
    const { fn } = mockFetch((url) =>
      url === TOKEN_URL
        ? {
            status: 400,
            text: '{"error":"invalid_grant","error_description":"Invalid grant: account not found"}',
          }
        : { status: 200 },
    );
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: playEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "play.sa").status).toBe("pass");
    expect(byId(report, "play.token").status).toBe("fail");
    expect(byId(report, "play.token").detail).toBe(en("doctor.play.invalidGrant"));
    expect(byId(report, "play.token").fix).toBe(en("doctor.fix.invalidGrant"));
    expect(byId(report, "play.app:app-android").status).toBe("skip");
  });

  it('403 "API has not been used / disabled" → enable-the-API diagnosis', async () => {
    const { fn } = mockFetch((url, init) => {
      if (url === TOKEN_URL) return { status: 200, body: { access_token: "tok" } };
      if (init?.method === "POST") {
        return {
          status: 403,
          text: "Google Play Android Developer API has not been used in project 42 before or it is disabled.",
        };
      }
      return { status: 200 };
    });
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: playEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "play.token").status).toBe("pass");
    expect(byId(report, "play.app:app-android").status).toBe("fail");
    expect(byId(report, "play.app:app-android").detail).toBe(en("doctor.play.apiDisabled"));
    expect(byId(report, "play.app:app-android").fix).toBe(en("doctor.fix.apiDisabled"));
  });

  it("any other 403 → Play Console invite / permission diagnosis naming the SA email", async () => {
    const { fn } = mockFetch((url, init) => {
      if (url === TOKEN_URL) return { status: 200, body: { access_token: "tok" } };
      if (init?.method === "POST") {
        return { status: 403, text: '{"error":{"message":"The caller does not have permission"}}' };
      }
      return { status: 200 };
    });
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: playEnv,
      fetchImpl: fn,
      lang: "en",
    });

    const app = byId(report, "play.app:app-android");
    expect(app.detail).toBe(en("doctor.play.403"));
    expect(app.fix).toContain(SA_EMAIL);
  });

  it("404 → package-name / no-release-history diagnosis", async () => {
    const { fn } = mockFetch((url, init) => {
      if (url === TOKEN_URL) return { status: 200, body: { access_token: "tok" } };
      if (init?.method === "POST") return { status: 404, text: "Not Found" };
      return { status: 200 };
    });
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: playEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "play.app:app-android").detail).toBe(en("doctor.play.404"));
  });

  it("healthy chain: edits.insert passes and the edit is deleted right away", async () => {
    const { fn, calls } = mockFetch((url, init) => {
      if (url === TOKEN_URL) return { status: 200, body: { access_token: "tok" } };
      if (init?.method === "POST") return { status: 200, body: { id: "edit-1" } };
      if (init?.method === "DELETE") return { status: 204 };
      return { status: 200 };
    });
    const report = await runDoctorChecks({
      cwd: androidDir(),
      env: playEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "play.app:app-android").status).toBe("pass");
    expect(report.ok).toBe(true);
    expect(calls).toContainEqual({
      url: "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits/edit-1",
      method: "DELETE",
    });
  });
});

// ── [5] Expo (EAS) chain ─────────────────────────────────────────────

const EAS_URL = "https://api.expo.dev/graphql";
const easApp = { ...iosApp, easProjectId: "11111111-aaaa-bbbb-cccc-222222222222" };

/**
 * EAS calls all POST the same GraphQL URL — route them by operation name in
 * the request body instead. Non-EAS urls fall through to `other`.
 */
function mockEasFetch(
  easRoutes: (operation: string) => { status?: number; payload?: unknown },
  other: () => { status: number; body?: unknown } = () => ({ status: 200, body: { data: [] } }),
) {
  const easCalls: { operation: string; variables: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: unknown, init?: { method?: string; body?: unknown }) => {
    if (String(url) !== EAS_URL) {
      const r = other();
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.body ?? {},
        text: async () => JSON.stringify(r.body ?? {}),
      };
    }
    const body = JSON.parse(String(init?.body));
    const operation = body.query.includes("CurrentUser") ? "CurrentUser" : "AppByIdQuery";
    easCalls.push({ operation, variables: body.variables });
    const r = easRoutes(operation);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.payload ?? { data: null },
      text: async () => JSON.stringify(r.payload ?? {}),
    };
  });
  return { fn: fn as unknown as typeof fetch, easCalls };
}

const easViewerPayload = {
  data: { meActor: { __typename: "Robot", id: "actor-1", firstName: "ci-bot" } },
};
const easProjectPayload = {
  data: {
    app: {
      byId: {
        id: easApp.easProjectId,
        name: "MyApp",
        slug: "myapp",
        ownerAccount: { id: "acc-1", name: "acme" },
      },
    },
  },
};

describe("doctor — Expo (EAS) chain", () => {
  it("skips the whole section when neither EAS_TOKEN nor easProjectId exist", async () => {
    const { fn } = mockFetch(() => ({ status: 200, body: { data: [] } }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.chain").status).toBe("skip");
    expect(byId(report, "eas.chain").label).toBe(en("doctor.skip.noEas"));
    expect(report.ok).toBe(true); // opting out of EAS is not a failure
  });

  it("easProjectId configured but EAS_TOKEN missing → token fails, rest skips", async () => {
    const { fn, easCalls } = mockEasFetch(() => ({ payload: easViewerPayload }));
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });

    const token = byId(report, "eas.token");
    expect(token.status).toBe("fail");
    expect(token.detail).toBe(en("doctor.env.missing"));
    expect(token.fix).toBe(en("doctor.fix.envEas"));
    expect(byId(report, "eas.viewer").status).toBe("skip");
    expect(byId(report, `eas.project:${easApp.easProjectId}`).status).toBe("skip");
    expect(easCalls).toHaveLength(0);
    expect(report.ok).toBe(false);
  });

  it("rejected token → CurrentUser diagnosis, project checks skip", async () => {
    const { fn } = mockEasFetch((op) =>
      op === "CurrentUser"
        ? { payload: { data: null, errors: [{ message: "UNAUTHORIZED: token invalid" }] } }
        : { payload: easProjectPayload },
    );
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: { ...ascEnv, EAS_TOKEN: "revoked-token" },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.token").status).toBe("pass");
    const viewer = byId(report, "eas.viewer");
    expect(viewer.status).toBe("fail");
    expect(viewer.detail).toContain("UNAUTHORIZED: token invalid");
    expect(viewer.fix).toBe(en("doctor.fix.easToken"));
    expect(byId(report, `eas.project:${easApp.easProjectId}`).status).toBe("skip");
  });

  it("EAS 5xx/429 → transient diagnosis, not token-replacement advice", async () => {
    const { fn } = mockEasFetch(() => ({ status: 503 }));
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: { ...ascEnv, EAS_TOKEN: "fine-token" },
      fetchImpl: fn,
      lang: "en",
    });

    const viewer = byId(report, "eas.viewer");
    expect(viewer.status).toBe("fail");
    expect(viewer.detail).toBe(en("doctor.eas.transient", { message: "EAS GraphQL HTTP 503" }));
    expect(viewer.fix).toBe(en("doctor.fix.easTransient"));
  });

  it("valid token but inaccessible project → per-project diagnosis", async () => {
    const { fn } = mockEasFetch((op) =>
      op === "CurrentUser"
        ? { payload: easViewerPayload }
        : { payload: { data: null, errors: [{ message: "Entity not authorized" }] } },
    );
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: { ...ascEnv, EAS_TOKEN: "good-token" },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.viewer").status).toBe("pass");
    const project = byId(report, `eas.project:${easApp.easProjectId}`);
    expect(project.status).toBe("fail");
    expect(project.detail).toContain("Entity not authorized");
    expect(project.fix).toBe(en("doctor.fix.easProject"));
    expect(report.ok).toBe(false);
  });

  it("healthy chain: viewer named, project resolved to @account/slug, one query each", async () => {
    const { fn, easCalls } = mockEasFetch((op) =>
      op === "CurrentUser" ? { payload: easViewerPayload } : { payload: easProjectPayload },
    );
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: { ...ascEnv, EAS_TOKEN: "good-token" },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.token").status).toBe("pass");
    const viewer = byId(report, "eas.viewer");
    expect(viewer.status).toBe("pass");
    expect(viewer.detail).toContain("ci-bot");
    const project = byId(report, `eas.project:${easApp.easProjectId}`);
    expect(project.status).toBe("pass");
    expect(project.detail).toBe("@acme/myapp");
    expect(easCalls.map((c) => c.operation)).toEqual(["CurrentUser", "AppByIdQuery"]);
    expect(easCalls[1].variables.appId).toBe(easApp.easProjectId);
    expect(report.ok).toBe(true);
  });

  it("EAS_TOKEN set without any easProjectId → viewer checked, projects noted as absent", async () => {
    const { fn } = mockEasFetch(() => ({ payload: easViewerPayload }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: { ...ascEnv, EAS_TOKEN: "good-token" },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.viewer").status).toBe("pass");
    expect(byId(report, "eas.projects").status).toBe("skip");
    expect(byId(report, "eas.projects").label).toBe(en("doctor.skip.noEasProjects"));
    expect(report.ok).toBe(true);
  });

  it("placeholder EAS_TOKEN from templates is flagged before any network call", async () => {
    const { fn, easCalls } = mockEasFetch(() => ({ payload: easViewerPayload }));
    const report = await runDoctorChecks({
      cwd: makeDir([easApp]),
      env: { ...ascEnv, EAS_TOKEN: "XXXXXXXXXX" },
      fetchImpl: fn,
      lang: "en",
    });

    expect(byId(report, "eas.token").status).toBe("fail");
    expect(byId(report, "eas.token").detail).toBe(en("doctor.env.placeholder"));
    expect(easCalls).toHaveLength(0);
  });

  it("config validation: non-string easProjectId fails the config check", async () => {
    const report = await runDoctorChecks({
      cwd: makeDir([{ ...iosApp, easProjectId: 42 }]),
      env: {},
      fetchImpl: neverFetch,
      lang: "en",
    });

    const fields = byId(report, "config.fields");
    expect(fields.status).toBe("fail");
    expect(fields.detail).toContain("easProjectId");
  });
});

// ── rendering + i18n ─────────────────────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

describe("doctor — report rendering", () => {
  async function failingReport(lang: "en" | "ko") {
    return runDoctorChecks({ cwd: makeDir(), env: {}, fetchImpl: neverFetch, lang });
  }

  it("prints ✓/✗/– marks, numbered sections and a summary with fixes + tutorial link", async () => {
    const report = await failingReport("en");
    const text = stripAnsi(renderDoctorReport(report, "en"));

    expect(text).toContain("[1] "); // config
    expect(text).toContain("[6] summary");
    expect(text).toContain("✗");
    expect(text).toContain("–");
    expect(text).toContain("run `storepulse init`");
    expect(text).toContain("https://diokr.github.io/storepulse/tutorial/");
  });

  it("localizes the whole report in Korean, including the ko tutorial URL", async () => {
    const report = await failingReport("ko");
    const text = stripAnsi(renderDoctorReport(report, "ko"));

    expect(text).toContain("크리덴셜·권한 진단");
    expect(text).toContain("[6] 요약");
    expect(text).toContain("https://diokr.github.io/storepulse/ko/tutorial/");
    expect(text).not.toContain("summary");
  });

  it("all-green report renders the success summary and no ✗", async () => {
    const { fn } = mockFetch(() => ({ status: 200, body: { data: [] } }));
    const report = await runDoctorChecks({
      cwd: makeDir([iosApp]),
      env: ascEnv,
      fetchImpl: fn,
      lang: "en",
    });
    const text = stripAnsi(renderDoctorReport(report, "en"));

    expect(report.ok).toBe(true);
    expect(text).toContain(uiString("doctor.summary.ok", "en"));
    expect(text).not.toContain("✗");
  });
});

describe("doctor — i18n key completeness", () => {
  it("every doctor.* key exists with non-empty en + ko and matching placeholders", () => {
    const doctorKeys = Object.keys(UI_STRINGS).filter((k) => k.startsWith("doctor."));
    expect(doctorKeys.length).toBeGreaterThan(0);
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of doctorKeys) {
      const entry = UI_STRINGS[key as UiKey];
      for (const lang of SUPPORTED_LANGS) {
        expect(entry[lang]?.trim().length, `${key}.${lang}`).toBeGreaterThan(0);
      }
      expect(placeholders(entry.ko), key).toEqual(placeholders(entry.en));
    }
  });

  it("the help text advertises doctor in both languages", () => {
    expect(uiString("cli.help.doctor", "en")).toContain("401/403");
    expect(uiString("cli.help.doctor", "ko")).toContain("401/403");
  });
});
