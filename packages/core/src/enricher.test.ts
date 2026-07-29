import { describe, expect, it } from "vitest";
import { type Enricher, enrichAll } from "./enricher.js";
import type { AppStatus } from "./types.js";

const base: AppStatus[] = [
  {
    target: { key: "a-ios", name: "A", platform: "ios", storeId: "1" },
    channels: [{ channel: "production", version: "1.0.0", state: "live" }],
    fetchedAt: "2026-07-27T00:00:00.000Z",
  },
];

/** Enricher that tags every channel's rawState so ordering is observable. */
const tagger = (id: string): Enricher => ({
  id,
  enrich: async (statuses) =>
    statuses.map((s) => ({
      ...s,
      channels: s.channels.map((c) => ({ ...c, rawState: `${c.rawState ?? ""}${id};` })),
    })),
});

describe("enrichAll", () => {
  it("applies enrichers in order, feeding each the previous result", async () => {
    const result = await enrichAll([tagger("one"), tagger("two")], base);
    expect(result[0].channels[0].rawState).toBe("one;two;");
    // input is never mutated — enrichment builds new statuses
    expect(base[0].channels[0].rawState).toBeUndefined();
  });

  it("skips a crashing enricher wholesale and keeps going", async () => {
    const crashing: Enricher = {
      id: "crashing",
      enrich: async () => {
        throw new Error("EAS is down");
      },
    };
    const result = await enrichAll([tagger("one"), crashing, tagger("two")], base);
    expect(result[0].channels[0].rawState).toBe("one;two;");
  });

  it("returns the statuses untouched when there are no enrichers", async () => {
    expect(await enrichAll([], base)).toBe(base);
  });
});
