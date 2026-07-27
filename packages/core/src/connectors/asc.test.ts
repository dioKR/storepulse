import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppTarget } from "../types.js";
import { AscConnector } from "./asc.js";

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
