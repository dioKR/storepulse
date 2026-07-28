import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppTarget } from "../types.js";
import { AscConnector, createAscToken } from "./asc.js";

const target: AppTarget = { key: "app-ios", name: "App", platform: "ios", storeId: "123" };

/** Builds a connector whose JWT signing and HTTP layer are stubbed out. */
function connectorWith(responses: Record<string, unknown>) {
  const connector = new AscConnector({ keyId: "k", issuerId: "i", privateKey: "unused" });
  vi.spyOn(connector as unknown as { token(): Promise<string> }, "token").mockResolvedValue("jwt");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(String(url)).pathname;
      const match = Object.entries(responses).find(([p]) => path.endsWith(p));
      if (!match) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => match[1] };
    }),
  );
  return connector;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AscConnector defensive parsing", () => {
  it("maps a brand-new appStoreState to 'unknown' and preserves rawState", async () => {
    const connector = connectorWith({
      "/appStoreVersions": {
        data: [
          {
            id: "v1",
            attributes: { versionString: "3.0.0", appStoreState: "SOME_FUTURE_STATE" },
          },
        ],
      },
      "/builds": { data: [] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.error).toBeUndefined();
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0]).toMatchObject({
      channel: "production",
      version: "3.0.0",
      state: "unknown",
      rawState: "SOME_FUTURE_STATE",
    });
  });

  it("survives a version entry with missing attributes", async () => {
    const connector = connectorWith({
      "/appStoreVersions": { data: [{ id: "v1" }] },
      "/builds": { data: [] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0].state).toBe("unknown");
    expect(status.channels[0].version).toBeNull();
  });

  it("survives a completely reshaped response (data not an array)", async () => {
    const connector = connectorWith({
      "/appStoreVersions": { data: { totally: "different" } },
      "/builds": { data: "nope" },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toEqual([]);
  });

  it("maps an unknown TestFlight processingState to 'unknown' with rawState", async () => {
    const connector = connectorWith({
      "/appStoreVersions": { data: [] },
      "/builds": {
        data: [{ id: "b1", attributes: { version: "42", processingState: "NEW_PIPELINE_STATE" } }],
      },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toHaveLength(1);
    expect(status.channels[0]).toMatchObject({
      channel: "beta",
      build: "42",
      state: "unknown",
      rawState: "NEW_PIPELINE_STATE",
    });
  });

  it("still maps known states correctly after the defensive rewrite", async () => {
    const connector = connectorWith({
      "/appStoreVersions": {
        data: [
          { id: "v2", attributes: { versionString: "2.5.0", appStoreState: "IN_REVIEW" } },
          { id: "v1", attributes: { versionString: "2.4.1", appStoreState: "READY_FOR_SALE" } },
        ],
      },
      // No phased release configured → 404 from the stub → plain "live"
      "/builds": {
        data: [{ id: "b1", attributes: { version: "108", processingState: "VALID" } }],
        included: [{ type: "preReleaseVersions", attributes: { version: "2.5.0" } }],
      },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels).toMatchObject([
      { channel: "production", version: "2.5.0", state: "in-review" },
      { channel: "production", version: "2.4.1", state: "live" },
      { channel: "beta", version: "2.5.0", build: "108", state: "live" },
    ]);
  });
});

describe("AscConnector release details (releaseNotes / date / expiresAt)", () => {
  it("maps createdDate → date and picks the ko localization first", async () => {
    const connector = connectorWith({
      "/appStoreVersions": {
        data: [
          {
            id: "v1",
            attributes: {
              versionString: "2.4.1",
              appStoreState: "READY_FOR_SALE",
              createdDate: "2026-07-01T09:00:00Z",
            },
          },
        ],
      },
      "/appStoreVersions/v1/appStoreVersionLocalizations": {
        data: [
          { attributes: { locale: "en-US", whatsNew: "Bug fixes." } },
          { attributes: { locale: "ko", whatsNew: "버그 수정 및 안정성 개선" } },
        ],
      },
      "/builds": { data: [] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0]).toMatchObject({
      channel: "production",
      version: "2.4.1",
      date: "2026-07-01T09:00:00Z",
      releaseNotes: "버그 수정 및 안정성 개선",
    });
  });

  it("falls back ko → en-US → first localization with text", async () => {
    const connector = connectorWith({
      "/appStoreVersions": {
        data: [
          { id: "v1", attributes: { versionString: "2.5.0", appStoreState: "IN_REVIEW" } },
          { id: "v2", attributes: { versionString: "2.4.1", appStoreState: "READY_FOR_SALE" } },
        ],
      },
      // v1 has no ko localization → en-US wins
      "/appStoreVersions/v1/appStoreVersionLocalizations": {
        data: [
          { attributes: { locale: "ja", whatsNew: "バグ修正" } },
          { attributes: { locale: "en-US", whatsNew: "Bug fixes." } },
        ],
      },
      // v2 has neither ko nor en-US, and the ko entry has empty whatsNew → first with text
      "/appStoreVersions/v2/appStoreVersionLocalizations": {
        data: [
          { attributes: { locale: "ko", whatsNew: "" } },
          { attributes: { locale: "fr-FR", whatsNew: "Corrections de bugs" } },
          { attributes: { locale: "de-DE", whatsNew: "Fehlerbehebungen" } },
        ],
      },
      "/builds": { data: [] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0].releaseNotes).toBe("Bug fixes.");
    expect(status.channels[1].releaseNotes).toBe("Corrections de bugs");
  });

  it("omits releaseNotes/date when localizations fail or fields are missing", async () => {
    const connector = connectorWith({
      "/appStoreVersions": {
        data: [{ id: "v1", attributes: { versionString: "2.4.1", appStoreState: "IN_REVIEW" } }],
      },
      // No localization stub → 404 → notes silently omitted, row survives
      "/builds": { data: [] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.error).toBeUndefined();
    expect(status.channels[0].releaseNotes).toBeUndefined();
    expect(status.channels[0].date).toBeUndefined();
  });

  it("maps TestFlight uploadedDate/expirationDate → date/expiresAt", async () => {
    const connector = connectorWith({
      "/appStoreVersions": { data: [] },
      "/builds": {
        data: [
          {
            id: "b1",
            attributes: {
              version: "108",
              processingState: "VALID",
              uploadedDate: "2026-07-20T10:00:00Z",
              expirationDate: "2026-10-18T10:00:00Z",
            },
          },
        ],
        included: [{ type: "preReleaseVersions", attributes: { version: "2.5.0" } }],
      },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0]).toMatchObject({
      channel: "beta",
      build: "108",
      date: "2026-07-20T10:00:00Z",
      expiresAt: "2026-10-18T10:00:00Z",
    });
  });

  it("leaves date/expiresAt undefined when the build has no dates", async () => {
    const connector = connectorWith({
      "/appStoreVersions": { data: [] },
      "/builds": { data: [{ id: "b1", attributes: { version: "42", processingState: "VALID" } }] },
    });

    const status = await connector.fetchAppStatus(target);
    expect(status.channels[0].date).toBeUndefined();
    expect(status.channels[0].expiresAt).toBeUndefined();
  });
});

describe("createAscToken (exported for storepulse doctor, #6)", () => {
  const pem = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;

  it("signs an ES256 JWT carrying kid + issuer", async () => {
    const token = await createAscToken({ keyId: "KEY123", issuerId: "issuer-1", privateKey: pem });
    const [header, payload] = token
      .split(".")
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")));
    expect(header).toMatchObject({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(payload).toMatchObject({ iss: "issuer-1", aud: "appstoreconnect-v1" });
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("throws when the .p8 content is not a parseable key", async () => {
    await expect(
      createAscToken({ keyId: "k", issuerId: "i", privateKey: "not a key" }),
    ).rejects.toThrow();
  });
});
