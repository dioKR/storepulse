import { describe, expect, it } from "vitest";
/**
 * The dashboard bundles the dictionary as a generated ES module
 * (packages/dashboard/src/i18n.js, written by scripts/gen-dashboard-i18n.mjs
 * during `pnpm build`). The file is committed so `storepulse serve` can serve
 * the dashboard straight from src/ in the monorepo — this test pins it to the
 * single-source dictionary so it cannot silently drift.
 */
// @ts-expect-error — plain generated JS module without type declarations
import * as bundled from "../../../dashboard/src/i18n.js";
import { STATE_EXPLANATIONS, SUPPORTED_LANGS, UI_STRINGS } from "./index.js";

describe("dashboard i18n bundle", () => {
  it("is in sync with the core dictionary (regenerate with pnpm build)", () => {
    expect(bundled.SUPPORTED_LANGS).toEqual([...SUPPORTED_LANGS]);
    expect(bundled.STATE_EXPLANATIONS).toEqual(STATE_EXPLANATIONS);
    expect(bundled.UI_STRINGS).toEqual(UI_STRINGS);
  });
});
