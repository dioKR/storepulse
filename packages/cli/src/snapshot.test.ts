import { fetchAll, SNAPSHOT_SCHEMA_VERSION } from "@storepulse/core";
import { describe, expect, it } from "vitest";
import { demoConnector, demoTargets } from "./demo.js";
import { renderSnapshotJson } from "./snapshot.js";

describe("renderSnapshotJson", () => {
  it("produces a valid v1 snapshot document from the demo board", async () => {
    const apps = await fetchAll([demoConnector], demoTargets);
    const parsed = JSON.parse(renderSnapshotJson(apps));

    expect(parsed.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(new Date(parsed.generatedAt).toISOString()).toBe(parsed.generatedAt);
    expect(parsed.apps).toHaveLength(demoTargets.length);
    for (const app of parsed.apps) {
      expect(typeof app.target.key).toBe("string");
      expect(Array.isArray(app.channels)).toBe(true);
      expect(typeof app.fetchedAt).toBe("string");
    }
  });

  it("passes the optional detail fields (releaseNotes/date/expiresAt) through untouched", async () => {
    const apps = await fetchAll([demoConnector], demoTargets);
    const parsed = JSON.parse(renderSnapshotJson(apps));
    const channels = parsed.apps.flatMap((app: { channels: unknown[] }) => app.channels);

    const beta = channels.find(
      (c: Record<string, unknown>) => c.expiresAt !== undefined && c.releaseNotes !== undefined,
    );
    expect(beta).toBeDefined();
    expect(typeof beta.releaseNotes).toBe("string");
    expect(new Date(beta.date).toISOString()).toBe(beta.date);
    expect(new Date(beta.expiresAt).toISOString()).toBe(beta.expiresAt);
  });

  it("never includes credential-shaped fields", async () => {
    const apps = await fetchAll([demoConnector], demoTargets);
    const json = renderSnapshotJson(apps).toLowerCase();
    for (const needle of ["privatekey", "private_key", "issuer", "client_email", "token"]) {
      expect(json).not.toContain(needle);
    }
  });

  it("ends with a trailing newline so --out files are POSIX-friendly", async () => {
    const apps = await fetchAll([demoConnector], demoTargets);
    expect(renderSnapshotJson(apps)).toMatch(/\n$/);
  });
});
