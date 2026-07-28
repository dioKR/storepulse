import { describe, expect, it } from "vitest";
import type { ReleaseState } from "../types.js";
import {
  formatMessage,
  normalizeLang,
  RELEASE_STATES,
  STATE_EXPLANATIONS,
  SUPPORTED_LANGS,
  UI_STRINGS,
  uiString,
} from "./index.js";

// Deliberately hardcoded: adding a ReleaseState must fail this test until the
// dictionary (and both languages) cover it.
const ALL_STATES: ReleaseState[] = [
  "live",
  "rollout",
  "in-review",
  "pending",
  "rejected",
  "halted",
  "draft",
  "unknown",
];

describe("state explanations — completeness", () => {
  it("covers every ReleaseState, in legend order", () => {
    expect(RELEASE_STATES).toEqual(ALL_STATES);
  });

  it.each(ALL_STATES)("explains %s in every supported language", (state) => {
    const info = STATE_EXPLANATIONS[state];
    expect(info.badge.length).toBeGreaterThan(0);
    expect(info.color).toBeTruthy();
    expect(Array.isArray(info.rawStates.ios)).toBe(true);
    expect(Array.isArray(info.rawStates.android)).toBe(true);
    for (const lang of SUPPORTED_LANGS) {
      expect(info.summary[lang].trim().length, `${state}.summary.${lang}`).toBeGreaterThan(0);
      expect(info.detail[lang].trim().length, `${state}.detail.${lang}`).toBeGreaterThan(0);
      expect(info.action[lang].trim().length, `${state}.action.${lang}`).toBeGreaterThan(0);
    }
  });

  it("keeps badge text language-invariant term identity (uppercase or fixed)", () => {
    // Badges are never translated — they must not contain Hangul.
    for (const state of ALL_STATES) {
      expect(STATE_EXPLANATIONS[state].badge).toMatch(/^[A-Za-z%n]+$/);
    }
  });

  it("maps the documented iOS rejection states to rejected", () => {
    expect(STATE_EXPLANATIONS.rejected.rawStates.ios).toEqual(
      expect.arrayContaining([
        "REJECTED",
        "METADATA_REJECTED",
        "DEVELOPER_REJECTED",
        "INVALID_BINARY",
      ]),
    );
  });
});

describe("UI strings — completeness", () => {
  it("has every key in every supported language, non-empty", () => {
    for (const [key, entry] of Object.entries(UI_STRINGS)) {
      for (const lang of SUPPORTED_LANGS) {
        expect(entry[lang]?.trim().length, `${key}.${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps placeholders identical across languages", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, entry] of Object.entries(UI_STRINGS)) {
      expect(placeholders(entry.ko), key).toEqual(placeholders(entry.en));
    }
  });
});

describe("normalizeLang", () => {
  it("parses language tags and POSIX locales", () => {
    expect(normalizeLang("ko")).toBe("ko");
    expect(normalizeLang("ko-KR")).toBe("ko");
    expect(normalizeLang("ko_KR.UTF-8")).toBe("ko");
    expect(normalizeLang("KO")).toBe("ko");
    expect(normalizeLang("en_US")).toBe("en");
    expect(normalizeLang("en")).toBe("en");
  });

  it("returns null for unsupported or empty values", () => {
    expect(normalizeLang("ja_JP")).toBeNull();
    expect(normalizeLang("C")).toBeNull();
    expect(normalizeLang("POSIX")).toBeNull();
    expect(normalizeLang("")).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
    expect(normalizeLang(null)).toBeNull();
  });
});

describe("uiString", () => {
  it("returns the string for the requested language", () => {
    expect(uiString("explain.meaning", "en")).toBe("meaning");
    expect(uiString("explain.meaning", "ko")).toBe("의미");
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(uiString("snapshot.written", "ko", { path: "/tmp/s.json" })).toContain("/tmp/s.json");
    expect(formatMessage("a {x} {y}", { x: 1 })).toBe("a 1 {y}");
  });
});
