import { describe, expect, it, vi } from "vitest";
import type { AppStatus, AppTarget, ChannelStatus, Platform } from "../types.js";
import {
  EAS_GRAPHQL_ENDPOINT,
  EasEnricher,
  EasGraphqlError,
  fetchEasProject,
  fetchEasViewer,
  matchEasBuild,
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
function gqlFetch(handler: (body: any) => { status?: number; payload?: unknown }) {
  const calls: GqlCall[] = [];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body,
    });
    const r = handler(body);
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

  it("matches on version alone (newest build wins) when the channel has no build number", async () => {
    // API order scrambled on purpose — the enricher re-sorts by completedAt.
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

describe("EasEnricher — queries", () => {
  it("sends ViewBuildsOnApp per project × platform with the platform/status filter and bearer token", async () => {
    const { fn, calls } = gqlFetch(() => ({ payload: buildsPayload([]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    await enricher.enrich([
      status(target("aurora-ios", "ios", PROJECT), []),
      status(target("aurora-android", "android", PROJECT), []),
    ]);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe(EAS_GRAPHQL_ENDPOINT);
      expect(call.method).toBe("POST");
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.body.query).toContain("query ViewBuildsOnApp");
      expect(call.body.variables.appId).toBe(PROJECT);
      expect(call.body.variables.filter.status).toBe("FINISHED");
    }
    expect(calls.map((c) => c.body.variables.filter.platform).sort()).toEqual(["ANDROID", "IOS"]);
  });

  it("deduplicates queries for targets sharing a projectId and platform", async () => {
    const { fn, calls } = gqlFetch(() => ({ payload: buildsPayload([]) }));
    const enricher = new EasEnricher({ token: TOKEN }, fn);

    await enricher.enrich([
      status(target("a-ios", "ios", PROJECT), []),
      status(target("b-ios", "ios", PROJECT), []),
    ]);

    expect(calls).toHaveLength(1);
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
