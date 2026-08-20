import { describe, expect, it, vi } from "vitest";
import type { AppStatus, AppTarget, ChannelStatus, Platform } from "../types.js";
import {
  EAS_GRAPHQL_ENDPOINT,
  EasEnricher,
  EasGraphqlError,
  fetchEasProject,
  fetchEasViewer,
  matchEasBuild,
  matchEasUpdate,
} from "./eas.js";

// NOTE: these tests replay recorded/handcrafted GraphQL responses in the
// shape the expo/eas-cli queries define. Verifying against the live EAS API
// with a real EAS_TOKEN is a manual reviewer step (see the PR checklist).

const PROJECT = "11111111-aaaa-bbbb-cccc-222222222222";
const TOKEN = "eas-token-123";

function target(key: string, platform: Platform, easProjectId?: string): AppTarget {
  return {
    key,
    name: "Aurora",
    platform,
    storeId: platform === "ios" ? "1" : "com.example.aurora",
    ...(easProjectId !== undefined && { easProjectId }),
  };
}

function status(t: AppTarget, channels: ChannelStatus[], error?: string): AppStatus {
  return {
    target: t,
    channels,
    fetchedAt: "2026-07-27T00:00:00.000Z",
    ...(error !== undefined && { error }),
  };
}

interface GqlCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

/** GraphQL-aware fetch mock: hand the parsed body to a handler per call. */
function gqlFetch(
  handler: (body: any) => { status?: number; payload?: unknown },
  updateHandler: (body: any) => { status?: number; payload?: unknown } = () => ({
    payload: updatesPayload([]),
  }),
) {
  const calls: GqlCall[] = [];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body,
    });
    const r = body.query.includes("ViewUpdateGroupsOnApp") ? updateHandler(body) : handler(body);
    const httpStatus = r.status ?? 200;
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      json: async () => r.payload ?? { data: null },
    };
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function buildsPayload(builds: unknown[]) {
  return { data: { app: { byId: { id: "app-1", builds } } } };
}

function updatesPayload(groups: unknown[][]) {
  return { data: { app: { byId: { id: "app-1", updateGroups: groups } } } };
}

function updateRecord(
  overrides: Record<string, unknown> = {},
  manifestOverrides: Record<string, unknown> = {},
) {
  const expoClient = {
    version: "2.5.0",
    ios: { buildNumber: "108", bundleIdentifier: "com.example.aurora" },
    android: { versionCode: 108, package: "com.example.aurora" },
    ...manifestOverrides,
  };
  return {
    id: "update-ios-1",
    group: "group-1",
    message: "Fix checkout flow",
    createdAt: "2026-07-23T10:00:00Z",
    platform: "IOS",
    manifestFragment: JSON.stringify({ extra: { expoClient } }),
    manifestPermalink: "https://u.expo.dev/group-1",
    gitCommitHash: "1234567890abcdef1234567890abcdef12345678",
    runtime: { version: "runtime-ios-108" },
    branch: { name: "production" },
    rolloutPercentage: 25,
    isRollBackToEmbedded: false,
    ...overrides,
  };
}

const build108 = {
  id: "3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90",
  status: "FINISHED",
  platform: "IOS",
  buildProfile: "production",
  appVersion: "2.5.0",
  appBuildVersion: "108",
  gitCommitHash: "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
  completedAt: "2026-07-21T09:30:00Z",
  submissions: [
    // Out of order on purpose — the enricher must pick the latest by createdAt.
    { id: "sub-old", status: "ERRORED", createdAt: "2026-07-21T10:00:00Z" },
    { id: "sub-new", status: "FINISHED", createdAt: "2026-07-22T10:00:00Z" },
  ],
};

const build107 = {
  ...build108,
  id: "build-107",
  appBuildVersion: "107",
  gitCommitHash: "0000000000000000000000000000000000000000",
  completedAt: "2026-07-18T09:30:00Z",
  submissions: [],
};

describe("EasEnricher — matching", () => {
  it("attaches profile/commit/buildId/completedAt/submissionStatus on a version+build match", async () => {
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([build108, build107]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const input = [
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
    ];
    const [enriched] = await enricher.enrich(input);

    expect(enriched.channels[0].eas).toEqual({
      profile: "production",
      commit: "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
      buildId: "3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90",
      completedAt: "2026-07-21T09:30:00Z",
      submissionStatus: "FINISHED", // latest submission by createdAt, not array order
    });
    // input statuses are never mutated
    expect(input[0].channels[0].eas).toBeUndefined();
  });

  it("matches on version alone via the store-delivered build when the channel has no build number", async () => {
    // API order scrambled on purpose — the enricher re-sorts by completedAt.
    // build108 is the one with a FINISHED submission; build107 was never submitted.
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([build107, build108]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "production", version: "2.5.0", state: "in-review" },
      ]),
    ]);

    expect(enriched.channels[0].eas?.buildId).toBe("3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90");
  });

  it("omits eas when the build number does not match, even with a matching version", async () => {
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([build108]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "999", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas).toBeUndefined();
  });

  it("omits eas for unmatched versions and null-version channels", async () => {
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([build108]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "production", version: "2.4.1", state: "live" },
        { channel: "internal", version: null, state: "draft" },
      ]),
    ]);

    expect(enriched.channels.every((c) => c.eas === undefined)).toBe(true);
  });
});

describe("EasEnricher — OTA matching", () => {
  it("attaches the latest OTA to an exact app version, build, and identifier", async () => {
    const old = updateRecord({ id: "old", group: "old-group", createdAt: "2026-07-22T10:00:00Z" });
    const latest = updateRecord();
    const { fn } = gqlFetch(
      () => ({ payload: buildsPayload([]) }),
      () => ({ payload: updatesPayload([[old, latest]]) }),
    );
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status({ ...target("aurora-ios", "ios", PROJECT), easAppIdentifier: "com.example.aurora" }, [
        { channel: "production", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas).toBeUndefined();
    expect(enriched.channels[0].easUpdate).toEqual({
      groupId: "group-1",
      branch: "production",
      message: "Fix checkout flow",
      commit: "1234567890abcdef1234567890abcdef12345678",
      createdAt: "2026-07-23T10:00:00Z",
      runtimeVersion: "runtime-ios-108",
      rolloutPercentage: 25,
      manifestPermalink: "https://u.expo.dev/group-1",
      isRollbackToEmbedded: false,
    });
  });

  it("matches OTA metadata even when EAS has no build because the binary was built locally", async () => {
    const android = updateRecord(
      { platform: "ANDROID", id: "update-android", group: "android-group" },
      { version: "0.1.1", android: { versionCode: 23, package: "com.example.aurora" } },
    );
    const { fn } = gqlFetch(
      () => ({ payload: buildsPayload([]) }),
      () => ({ payload: updatesPayload([[android]]) }),
    );
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-android", "android", PROJECT), [
        { channel: "internal", version: "0.1.1", build: "23", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas).toBeUndefined();
    expect(enriched.channels[0].easUpdate?.groupId).toBe("android-group");
  });

  it("does not attach an OTA for another build or app variant", async () => {
    const wrongBuild = updateRecord(
      {},
      { ios: { buildNumber: "109", bundleIdentifier: "com.example.aurora" } },
    );
    const wrongVariant = updateRecord(
      { id: "dev", group: "dev-group" },
      { ios: { buildNumber: "108", bundleIdentifier: "com.example.aurora.dev" } },
    );
    const { fn } = gqlFetch(
      () => ({ payload: buildsPayload([]) }),
      () => ({ payload: updatesPayload([[wrongBuild, wrongVariant]]) }),
    );
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status({ ...target("aurora-ios", "ios", PROJECT), easAppIdentifier: "com.example.aurora" }, [
        { channel: "production", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].easUpdate).toBeUndefined();
  });

  it("keeps build enrichment when the independent OTA query fails", async () => {
    const { fn } = gqlFetch(
      () => ({ payload: buildsPayload([build108]) }),
      () => ({ status: 500 }),
    );
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "production", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas?.buildId).toBe(build108.id);
    expect(enriched.channels[0].easUpdate).toBeUndefined();
  });
});

describe("EasEnricher — variant scoping (appIdentifier)", () => {
  const prodBuild = {
    ...build108,
    id: "b-prod",
    platform: "ANDROID",
    appIdentifier: "com.example.aurora",
  };
  const devBuild = {
    ...build108,
    id: "b-dev",
    platform: "ANDROID",
    appIdentifier: "com.example.aurora.dev",
  };

  it("android: only builds whose appIdentifier equals storeId can match", async () => {
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([devBuild, prodBuild]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-android", "android", PROJECT), [
        { channel: "production", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas?.buildId).toBe("b-prod");
  });

  it("ios: multiple variants without easAppIdentifier skip enrichment entirely", async () => {
    const iosProd = { ...build108, id: "i-prod", appIdentifier: "com.example.aurora" };
    const iosDev = { ...build108, id: "i-dev", appIdentifier: "com.example.aurora.dev" };
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([iosProd, iosDev]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas).toBeUndefined();
  });

  it("ios: easAppIdentifier scopes matching to the chosen variant", async () => {
    const iosProd = { ...build108, id: "i-prod", appIdentifier: "com.example.aurora" };
    const iosDev = { ...build108, id: "i-dev", appIdentifier: "com.example.aurora.dev" };
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([iosDev, iosProd]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const withIdentifier = {
      ...target("aurora-ios", "ios", PROJECT),
      easAppIdentifier: "com.example.aurora",
    };
    const [enriched] = await enricher.enrich([
      status(withIdentifier, [{ channel: "beta", version: "2.5.0", build: "108", state: "live" }]),
    ]);

    expect(enriched.channels[0].eas?.buildId).toBe("i-prod");
  });

  it("single-variant projects keep enriching without any identifier config", async () => {
    const only = { ...build108, id: "solo", appIdentifier: "com.example.aurora" };
    const { fn } = gqlFetch(() => ({ payload: buildsPayload([only]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [enriched] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(enriched.channels[0].eas?.buildId).toBe("solo");
  });
});

describe("EasEnricher — queries", () => {
  it("sends ViewBuildsOnApp per project × platform with the platform/status filter and bearer token", async () => {
    const { fn, calls } = gqlFetch(() => ({ payload: buildsPayload([]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), []),
      status(target("aurora-android", "android", PROJECT), []),
    ]);

    const buildCalls = calls.filter((call) => call.body.query.includes("ViewBuildsOnApp"));
    const updateCalls = calls.filter((call) => call.body.query.includes("ViewUpdateGroupsOnApp"));
    expect(buildCalls).toHaveLength(2);
    expect(updateCalls).toHaveLength(1);
    for (const call of buildCalls) {
      expect(call.url).toBe(EAS_GRAPHQL_ENDPOINT);
      expect(call.method).toBe("POST");
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.body.query).toContain("query ViewBuildsOnApp");
      expect(call.body.variables.appId).toBe(PROJECT);
      expect(call.body.variables.filter.status).toBe("FINISHED");
    }
    expect(buildCalls.map((c) => c.body.variables.filter.platform).sort()).toEqual([
      "ANDROID",
      "IOS",
    ]);
    expect(updateCalls[0].body.variables).toEqual({ appId: PROJECT, offset: 0, limit: 50 });
  });

  it("deduplicates queries for targets sharing a projectId and platform", async () => {
    const { fn, calls } = gqlFetch(() => ({ payload: buildsPayload([]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    await enricher.enrich([
      status(target("a-ios", "ios", PROJECT), []),
      status(target("b-ios", "ios", PROJECT), []),
    ]);

    expect(calls.filter((call) => call.body.query.includes("ViewBuildsOnApp"))).toHaveLength(1);
    expect(calls.filter((call) => call.body.query.includes("ViewUpdateGroupsOnApp"))).toHaveLength(
      1,
    );
  });

  it("never queries for targets without easProjectId or with a fetch error", async () => {
    const { fn, calls } = gqlFetch(() => ({ payload: buildsPayload([]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const input = [
      status(target("plain-ios", "ios"), [
        { channel: "production", version: "1.0.0", state: "live" },
      ]),
      status(target("broken-ios", "ios", PROJECT), [], "ASC API 401"),
    ];
    const result = await enricher.enrich(input);

    expect(calls).toHaveLength(0);
    expect(result).toEqual(input);
  });
});

describe("EasEnricher — failure isolation", () => {
  const otherProject = "99999999-dddd-eeee-ffff-000000000000";

  it("a failing project query skips only that project's targets", async () => {
    const { fn } = gqlFetch((body) =>
      body.variables.appId === PROJECT ? { status: 500 } : { payload: buildsPayload([build108]) },
    );
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const [broken, healthy] = await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
      status(target("borealis-ios", "ios", otherProject), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
    ]);

    expect(broken.channels[0].eas).toBeUndefined();
    expect(broken.error).toBeUndefined(); // enrichment failures never mark the row
    expect(healthy.channels[0].eas?.profile).toBe("production");
  });

  it("swallows GraphQL-level errors (bad projectId, no access) silently", async () => {
    const { fn } = gqlFetch(() => ({
      payload: { data: null, errors: [{ message: "Entity not authorized" }] },
    }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    const input = [
      status(target("aurora-ios", "ios", PROJECT), [
        { channel: "beta", version: "2.5.0", build: "108", state: "live" },
      ]),
    ];
    await expect(enricher.enrich(input)).resolves.toEqual(input);
  });

  it("swallows a thrown fetch (network down) silently", async () => {
    const enricher = new EasEnricher({ token: TOKEN }, (() => {
      throw new Error("getaddrinfo ENOTFOUND api.expo.dev");
    }) as unknown as typeof fetch);

    const input = [status(target("aurora-ios", "ios", PROJECT), [])];
    await expect(enricher.enrich(input)).resolves.toEqual(input);
  });
});

describe("matchEasBuild", () => {
  const builds = [
    { appVersion: "2.5.0", appBuildVersion: "108", buildId: "b108" },
    { appVersion: "2.5.0", appBuildVersion: "107", buildId: "b107" },
  ];

  it("null version never matches", () => {
    expect(matchEasBuild({ version: null }, builds)).toBeUndefined();
  });

  it("build number narrows within the same version", () => {
    expect(matchEasBuild({ version: "2.5.0", build: "107" }, builds)?.buildId).toBe("b107");
  });

  it("without a build number, the store-delivered binary wins over newer builds", () => {
    const retried = [
      { appVersion: "3.0.0", appBuildVersion: "12", buildId: "b12-preview" },
      {
        appVersion: "3.0.0",
        appBuildVersion: "11",
        buildId: "b11-store",
        submissionStatus: "FINISHED",
      },
    ];
    expect(matchEasBuild({ version: "3.0.0" }, retried)?.buildId).toBe("b11-store");
  });

  it("without a build number and no submissions, multiple candidates stay unmatched", () => {
    const twins = [
      { appVersion: "3.0.0", appBuildVersion: "12", buildId: "b12" },
      { appVersion: "3.0.0", appBuildVersion: "11", buildId: "b11" },
    ];
    expect(matchEasBuild({ version: "3.0.0" }, twins)).toBeUndefined();
  });

  it("without a build number, a single candidate still matches", () => {
    const solo = [{ appVersion: "2.4.0", buildId: "solo" }];
    expect(matchEasBuild({ version: "2.4.0" }, solo)?.buildId).toBe("solo");
  });

  it("custom release names fall back to a unique build number", () => {
    // Play custom release names land in `version`; versionCode still identifies the build
    expect(matchEasBuild({ version: "여름 프로모션", build: "108" }, builds)?.buildId).toBe("b108");
  });

  it("build-number fallback stays off when the number is ambiguous", () => {
    const reused = [
      { appVersion: "2.5.0", appBuildVersion: "1", buildId: "b1-new" },
      { appVersion: "2.4.0", appBuildVersion: "1", buildId: "b1-old" },
    ];
    expect(matchEasBuild({ version: "custom name", build: "1" }, reused)).toBeUndefined();
  });

  it("no fallback when the version matched but the build number did not", () => {
    expect(matchEasBuild({ version: "2.5.0", build: "999" }, builds)).toBeUndefined();
  });
});

describe("matchEasUpdate", () => {
  const updates = [
    { appVersion: "0.1.1", appBuildVersion: "23", groupId: "g23" },
    { appVersion: "0.1.1", appBuildVersion: "22", groupId: "g22" },
  ];

  it("requires an exact version and build when both are available", () => {
    expect(matchEasUpdate({ version: "0.1.1", build: "23" }, updates)?.groupId).toBe("g23");
    expect(matchEasUpdate({ version: "0.1.1", build: "24" }, updates)).toBeUndefined();
  });

  it("never guesses when a build-less store entry has several runtimes", () => {
    expect(matchEasUpdate({ version: "0.1.1" }, updates)).toBeUndefined();
  });

  it("matches a unique version when the store does not expose a build number", () => {
    expect(
      matchEasUpdate({ version: "0.2.0" }, [
        { appVersion: "0.2.0", appBuildVersion: "24", groupId: "g24" },
      ])?.groupId,
    ).toBe("g24");
  });
});

describe("doctor probes — fetchEasViewer / fetchEasProject", () => {
  it("viewer: returns id/typename/name from the CurrentUser query", async () => {
    const { fn, calls } = gqlFetch(() => ({
      payload: { data: { meActor: { __typename: "Robot", id: "actor-1", firstName: "ci-bot" } } },
    }));

    await expect(fetchEasViewer(TOKEN, fn)).resolves.toEqual({
      id: "actor-1",
      typename: "Robot",
      name: "ci-bot",
    });
    expect(calls[0].body.query).toContain("query CurrentUser");
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("viewer: GraphQL errors become EasGraphqlError with the server message", async () => {
    const { fn } = gqlFetch(() => ({
      payload: { data: null, errors: [{ message: "UNAUTHORIZED: token invalid" }] },
    }));

    await expect(fetchEasViewer(TOKEN, fn)).rejects.toThrowError(EasGraphqlError);
    await expect(fetchEasViewer(TOKEN, fn)).rejects.toThrow("UNAUTHORIZED: token invalid");
  });

  it("viewer: non-2xx HTTP becomes EasGraphqlError carrying the status", async () => {
    const { fn } = gqlFetch(() => ({ status: 401 }));

    await expect(fetchEasViewer(TOKEN, fn)).rejects.toMatchObject({ status: 401 });
  });

  it("project: resolves name and @account/slug via AppByIdQuery", async () => {
    const { fn, calls } = gqlFetch(() => ({
      payload: {
        data: {
          app: {
            byId: {
              id: PROJECT,
              name: "Aurora",
              slug: "aurora",
              ownerAccount: { id: "acc-1", name: "acme" },
            },
          },
        },
      },
    }));

    await expect(fetchEasProject(TOKEN, PROJECT, fn)).resolves.toEqual({
      id: PROJECT,
      name: "Aurora",
      fullName: "@acme/aurora",
    });
    expect(calls[0].body.query).toContain("query AppByIdQuery");
    expect(calls[0].body.variables.appId).toBe(PROJECT);
  });

  it("project: an empty byId answer is an EasGraphqlError, not a crash", async () => {
    const { fn } = gqlFetch(() => ({ payload: { data: { app: null } } }));

    await expect(fetchEasProject(TOKEN, PROJECT, fn)).rejects.toThrowError(EasGraphqlError);
  });
});
