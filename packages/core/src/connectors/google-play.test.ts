import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppTarget } from "../types.js";
import { GooglePlayConnector } from "./google-play.js";

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
