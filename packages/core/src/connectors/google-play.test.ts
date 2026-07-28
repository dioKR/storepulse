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

/** Builds a connector whose OAuth exchange and HTTP layer are stubbed out. */
function connectorWith(tracksResponse: unknown, editResponse: unknown = { id: "edit-1" }) {
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
      if (method === "DELETE") {
        return { ok: true, status: 204, json: async () => null };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
  return connector;
}

afterEach(() => {
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

  it("still maps known states (staged rollout) after the defensive rewrite", async () => {
    const connector = connectorWith({
      tracks: [
        {
          track: "production",
          releases: [
            { name: "2.4.1", status: "inProgress", versionCodes: ["241"], userFraction: 0.5 },
          ],
        },
        { track: "internal", releases: [{ name: "2.5.0", status: "draft" }] },
      ],
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toMatchObject([
      { channel: "production", state: "rollout", rolloutPercent: 50, build: "241" },
      { channel: "internal", state: "draft", version: "2.5.0" },
    ]);
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
