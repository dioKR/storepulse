import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppTarget } from "../types.js";
import {
  createPlayAccessToken,
  GooglePlayConnector,
  PlayTokenExchangeError,
} from "./google-play.js";

const target: AppTarget = {
  key: "app-android",
  name: "App",
  platform: "android",
  storeId: "com.example.app",
};

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function lifecycleRequestCount(): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => /\/tracks\/[^/]+\/releases$/.test(new URL(String(url)).pathname))
    .length;
}

/** Builds a connector whose OAuth exchange and HTTP layer are stubbed out. */
function connectorWith(
  tracksResponse: unknown,
  editResponse: unknown = { id: "edit-1" },
  lifecycleResponses: Record<string, unknown> = {},
) {
  const connector = new GooglePlayConnector({ clientEmail: "e@x.com", privateKey: "unused" });
  vi.spyOn(connector as unknown as { token(): Promise<string> }, "token").mockResolvedValue("tok");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: { method?: string }) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      if (method === "POST" && path.endsWith("/edits")) {
        return { ok: true, status: 200, json: async () => editResponse };
      }
      if (method === "GET" && path.endsWith("/tracks")) {
        return { ok: true, status: 200, json: async () => tracksResponse };
      }
      const lifecycleMatch = path.match(/\/tracks\/([^/]+)\/releases$/);
      if (method === "GET" && lifecycleMatch) {
        const trackName = decodeURIComponent(lifecycleMatch[1]);
        const lifecycleResponse = lifecycleResponses[trackName] ?? { releases: [] };
        if (lifecycleResponse instanceof MockHttpError) {
          return {
            ok: false,
            status: lifecycleResponse.status,
            text: async () => lifecycleResponse.message,
          };
        }
        if (lifecycleResponse instanceof Error) {
          return { ok: false, status: 503, text: async () => lifecycleResponse.message };
        }
        return {
          ok: true,
          status: 200,
          json: async () => lifecycleResponse,
        };
      }
      if (method === "DELETE") {
        return { ok: true, status: 204, json: async () => null };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
  return connector;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GooglePlayConnector defensive parsing", () => {
  it("maps a brand-new release status to 'unknown' and preserves rawState", async () => {
    const connector = connectorWith({
      tracks: [
        {
          track: "production",
          releases: [{ name: "1.2.3", status: "someFutureStatus", versionCodes: ["123"] }],
        },
      ],
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.error).toBeUndefined();
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0]).toMatchObject({
      channel: "production",
      version: "1.2.3",
      build: "123",
      state: "unknown",
      rawState: "production/someFutureStatus",
    });
  });

  it("survives a release with every field missing", async () => {
    const connector = connectorWith({ tracks: [{ track: "production", releases: [{}] }] });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0]).toMatchObject({
      channel: "production",
      version: null,
      build: null,
      state: "unknown",
    });
  });

  it("survives a completely reshaped tracks response", async () => {
    const connector = connectorWith({ tracks: "gone" });
    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toEqual([]);
  });

  it("survives versionCodes not being an array", async () => {
    const connector = connectorWith({
      tracks: [
        {
          track: "production",
          releases: [{ name: "33 (0.1.18)", status: "completed", versionCodes: 33 }],
        },
      ],
    });

    const status = await connector.fetchAppStatus(target);
    // Falls back to the versionCode embedded in the auto-generated release name
    expect(status.channels[0]).toMatchObject({ version: "0.1.18", build: "33", state: "live" });
  });

  it("throws a clear error when edits.insert stops returning an id", async () => {
    const connector = connectorWith({ tracks: [] }, { totally: "different" });
    await expect(connector.fetchAppStatus(target)).rejects.toThrow(/edits\.insert/);
  });

  it("maps inProgress to rollout only when the lifecycle is PUBLISHED", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [
              {
                name: "2.4.1",
                status: "inProgress",
                versionCodes: ["241"],
                userFraction: 0.5,
              },
            ],
          },
          { track: "internal", releases: [{ name: "2.5.0", status: "draft" }] },
        ],
      },
      { id: "edit-1" },
      {
        production: {
          releases: [
            {
              releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
              activeArtifacts: [{ versionCode: "241" }],
            },
          ],
        },
      },
    );

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toMatchObject([
      { channel: "production", state: "rollout", rolloutPercent: 50, build: "241" },
      { channel: "internal", state: "draft", version: "2.5.0" },
    ]);
  });

  it("uses the release lifecycle instead of treating review progress as rollout", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [
              {
                name: "39 (0.1.19)",
                status: "inProgress",
                versionCodes: ["39"],
                userFraction: 0.5,
              },
            ],
          },
        ],
      },
      { id: "edit-1" },
      {
        production: {
          releases: [
            {
              releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
              activeArtifacts: [{ versionCode: "39" }],
            },
          ],
        },
      },
    );

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0]).toMatchObject({
      channel: "production",
      version: "0.1.19",
      build: "39",
      state: "in-review",
      rawState: "production/inProgress; lifecycle=RELEASE_LIFECYCLE_STATE_IN_REVIEW",
    });
    expect(status.channels[0].rolloutPercent).toBeUndefined();
  });

  it("lets review lifecycle override a completed future rollout configuration", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.2.3", status: "completed", versionCodes: ["123"] }],
          },
        ],
      },
      { id: "edit-1" },
      {
        production: {
          releases: [
            {
              releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
              activeArtifacts: [{ versionCode: "123" }],
            },
          ],
        },
      },
    );

    expect((await connector.fetchAppStatus(target)).channels[0].state).toBe("in-review");
  });

  it.each([
    ["RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED", "pending"],
    ["RELEASE_LIFECYCLE_STATE_NOT_APPROVED", "rejected"],
    ["RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW", "draft"],
  ])("maps lifecycle %s to %s", async (releaseLifecycleState, expectedState) => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.2.3", status: "draft", versionCodes: ["123"] }],
          },
        ],
      },
      { id: "edit-1" },
      {
        production: {
          releases: [{ releaseLifecycleState, activeArtifacts: [{ versionCode: "123" }] }],
        },
      },
    );

    expect((await connector.fetchAppStatus(target)).channels[0].state).toBe(expectedState);
  });

  it("does not claim rollout when lifecycle data for inProgress is missing", async () => {
    const connector = connectorWith({
      tracks: [
        {
          track: "production",
          releases: [
            { name: "2.4.1", status: "inProgress", versionCodes: ["241"], userFraction: 0.5 },
          ],
        },
      ],
    });

    const release = (await connector.fetchAppStatus(target)).channels[0];
    expect(release.state).toBe("unknown");
    expect(release.rolloutPercent).toBeUndefined();
    expect(release.rawState).toContain("lifecycle=(missing)");
  });

  it("surfaces an unavailable lifecycle lookup without failing the whole app", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [
              {
                name: "2.4.1",
                status: "inProgress",
                versionCodes: ["241"],
                userFraction: 0.5,
              },
            ],
          },
        ],
      },
      { id: "edit-1" },
      { production: new Error("temporary API failure") },
    );

    const release = (await connector.fetchAppStatus(target)).channels[0];
    expect(release.state).toBe("unknown");
    expect(release.rolloutPercent).toBeUndefined();
    expect(release.rawState).toContain("lifecycle=(unavailable)");
  });

  it("skips lifecycle calls only for tracks without a versioned release", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.0.0", status: "completed", versionCodes: ["100"] }],
          },
          { track: "internal", releases: [{ status: "draft" }] },
          {
            track: "beta",
            releases: [{ name: "1.1.0", status: "inProgress", versionCodes: ["110"] }],
          },
        ],
      },
      { id: "edit-1" },
      {
        beta: {
          releases: [
            {
              releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
              activeArtifacts: [{ versionCode: "110" }],
            },
          ],
        },
      },
    );

    await connector.fetchAppStatus(target);

    expect(lifecycleRequestCount()).toBe(2);
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/tracks/production/")),
    ).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/tracks/beta/"))).toBe(
      true,
    );
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/tracks/internal/")),
    ).toBe(false);
  });

  it("reuses a successful lifecycle response within the cache TTL", async () => {
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.2.3", status: "inProgress", versionCodes: ["123"] }],
          },
        ],
      },
      { id: "edit-1" },
      {
        production: {
          releases: [
            {
              releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
              activeArtifacts: [{ versionCode: "123" }],
            },
          ],
        },
      },
    );

    await connector.fetchAppStatus(target);
    await connector.fetchAppStatus(target);

    expect(lifecycleRequestCount()).toBe(1);
  });

  it("refreshes for a new build and never applies the old cache when quota is exhausted", async () => {
    const tracksResponse = {
      tracks: [
        {
          track: "production",
          releases: [{ name: "1.2.3", status: "completed", versionCodes: ["123"] }],
        },
      ],
    };
    const lifecycleResponses: Record<string, unknown> = {
      production: {
        releases: [
          {
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: "123" }],
          },
        ],
      },
    };
    const connector = connectorWith(tracksResponse, { id: "edit-1" }, lifecycleResponses);

    expect((await connector.fetchAppStatus(target)).channels[0].state).toBe("live");
    tracksResponse.tracks[0].releases.unshift({
      name: "1.2.4",
      status: "completed",
      versionCodes: ["124"],
    });
    lifecycleResponses.production = new MockHttpError(403, "Listing releases quota exceeded.");

    const refreshed = await connector.fetchAppStatus(target);
    const newBuild = refreshed.channels.find((release) => release.build === "124");
    const cachedBuild = refreshed.channels.find((release) => release.build === "123");

    expect(newBuild?.state).toBe("unknown");
    expect(newBuild?.rawState).toContain("lifecycle=(missing)");
    expect(cachedBuild?.state).toBe("live");
    expect(cachedBuild?.rawState).toContain("lifecycleCache=stale");
    expect(lifecycleRequestCount()).toBe(2);

    await connector.fetchAppStatus(target);
    expect(lifecycleRequestCount()).toBe(2);
  });

  it("keeps the last lifecycle state stale and backs off after quota exhaustion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    const lifecycleResponses: Record<string, unknown> = {
      production: {
        releases: [
          {
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
            activeArtifacts: [{ versionCode: "123" }],
          },
        ],
      },
    };
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.2.3", status: "inProgress", versionCodes: ["123"] }],
          },
        ],
      },
      { id: "edit-1" },
      lifecycleResponses,
    );

    expect((await connector.fetchAppStatus(target)).channels[0].state).toBe("in-review");
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    lifecycleResponses.production = new MockHttpError(403, "Listing releases quota exceeded.");

    const stale = (await connector.fetchAppStatus(target)).channels[0];
    expect(stale.state).toBe("in-review");
    expect(stale.rawState).toContain("lifecycleCache=stale");
    expect(lifecycleRequestCount()).toBe(2);

    await connector.fetchAppStatus(target);
    expect(lifecycleRequestCount()).toBe(2);
  });

  it("backs off quota errors even when no lifecycle value has been cached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    const connector = connectorWith(
      {
        tracks: [
          {
            track: "production",
            releases: [{ name: "1.2.3", status: "inProgress", versionCodes: ["123"] }],
          },
        ],
      },
      { id: "edit-1" },
      { production: new MockHttpError(403, "Listing releases quota exceeded.") },
    );

    const first = (await connector.fetchAppStatus(target)).channels[0];
    const second = (await connector.fetchAppStatus(target)).channels[0];

    expect(first.state).toBe("unknown");
    expect(second.state).toBe("unknown");
    expect(first.rawState).toContain("lifecycle=(quota-exceeded)");
    expect(lifecycleRequestCount()).toBe(1);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    await connector.fetchAppStatus(target);
    expect(lifecycleRequestCount()).toBe(2);
  });
});

describe("GooglePlayConnector releaseNotes", () => {
  const releaseWith = (releaseNotes: unknown) => ({
    tracks: [
      {
        track: "production",
        releases: [{ name: "1.2.3", status: "completed", versionCodes: ["123"], releaseNotes }],
      },
    ],
  });

  it("prefers the ko-KR release notes", async () => {
    const connector = connectorWith(
      releaseWith([
        { language: "en-US", text: "Bug fixes." },
        { language: "ko-KR", text: "버그 수정\n안정성 개선" },
      ]),
    );

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0].releaseNotes).toBe("버그 수정\n안정성 개선");
  });

  it("falls back ko-KR → en-US → first entry with text", async () => {
    const enFallback = connectorWith(
      releaseWith([
        { language: "ja-JP", text: "バグ修正" },
        { language: "en-US", text: "Bug fixes." },
      ]),
    );
    expect((await enFallback.fetchAppStatus(target)).channels[0].releaseNotes).toBe("Bug fixes.");

    const firstFallback = connectorWith(
      releaseWith([
        { language: "ko-KR", text: "" }, // empty text never wins
        { language: "fr-FR", text: "Corrections de bugs" },
        { language: "de-DE", text: "Fehlerbehebungen" },
      ]),
    );
    expect((await firstFallback.fetchAppStatus(target)).channels[0].releaseNotes).toBe(
      "Corrections de bugs",
    );
  });

  it("omits releaseNotes when the field is missing or reshaped", async () => {
    for (const notes of [undefined, "gone", [], [{ language: "ko-KR" }], [{ text: 42 }]]) {
      const connector = connectorWith(releaseWith(notes));
      const status = await connector.fetchAppStatus(target);
      expect(status.error).toBeUndefined();
      expect(status.channels[0].releaseNotes).toBeUndefined();
    }
  });
});

describe("createPlayAccessToken (exported for storepulse doctor, #6)", () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
  const creds = { clientEmail: "sa@project.iam.gserviceaccount.com", privateKey: pem };

  it("exchanges a signed assertion for the access token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "play-token" }),
      text: async () => "",
    })) as unknown as typeof fetch;

    await expect(createPlayAccessToken(creds, fetchImpl)).resolves.toBe("play-token");
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("assertion=");
  });

  it("throws PlayTokenExchangeError carrying status + body on a non-2xx answer", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => '{"error":"invalid_grant","error_description":"Invalid grant"}',
    })) as unknown as typeof fetch;

    const err = await createPlayAccessToken(creds, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(PlayTokenExchangeError);
    expect(err.status).toBe(400);
    expect(err.body).toContain("invalid_grant");
    expect(err.message).toBe("Google OAuth token exchange failed (400)");
  });
});
