import { RELEASE_STATES } from "@storepulse/core";
import { describe, expect, it } from "vitest";
import {
  findState,
  renderExplainLegend,
  renderExplainState,
  renderUnknownState,
} from "./explain.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

describe("renderExplainLegend", () => {
  it("lists every release state with its fixed badge (en)", () => {
    const out = stripAnsi(renderExplainLegend("en"));
    for (const state of RELEASE_STATES) expect(out).toContain(state);
    for (const badge of ["LIVE", "n%", "REVIEW", "PENDING", "REJECTED", "HALTED", "draft"]) {
      expect(out).toContain(badge);
    }
    expect(out).toContain("release states");
    expect(out).toContain("Released and available to users on the store.");
  });

  it("translates descriptions but never badges (ko)", () => {
    const out = stripAnsi(renderExplainLegend("ko"));
    expect(out).toContain("릴리즈 상태");
    expect(out).toContain("스토어에 릴리즈되어 사용자에게 제공 중입니다.");
    // Badge text is term identity — still English in Korean output.
    expect(out).toContain("REJECTED");
    expect(out).toContain("LIVE");
  });
});

describe("renderExplainState", () => {
  it("shows meaning, store raw states, and the recommended action (en)", () => {
    const out = stripAnsi(renderExplainState("rejected", "en"));
    expect(out).toContain("REJECTED");
    expect(out).toContain("meaning");
    expect(out).toContain("store states");
    expect(out).toContain("recommended action");
    for (const raw of ["REJECTED", "METADATA_REJECTED", "DEVELOPER_REJECTED", "INVALID_BINARY"]) {
      expect(out).toContain(raw);
    }
    expect(out).toContain("Resolution Center");
  });

  it("renders the Korean detail with the recommended action (ko)", () => {
    const out = stripAnsi(renderExplainState("rejected", "ko"));
    expect(out).toContain("의미");
    expect(out).toContain("스토어 원본 상태");
    expect(out).toContain("권장 액션");
    expect(out).toContain("METADATA_REJECTED");
    expect(out).toContain("Resolution Center에서 거절 사유를 확인");
  });

  it("shows a placeholder for stores without raw states", () => {
    const out = stripAnsi(renderExplainState("halted", "en"));
    expect(out).toContain("iOS");
    expect(out).toContain("Android");
    expect(out).toContain("halted");
    expect(out).toContain("—"); // iOS has no halted raw state
  });
});

describe("findState", () => {
  it("matches state ids case-insensitively", () => {
    expect(findState("rejected")).toBe("rejected");
    expect(findState("In-Review")).toBe("in-review");
  });

  it("also matches badge text, since that is what the board shows", () => {
    expect(findState("REVIEW")).toBe("in-review");
    expect(findState("live")).toBe("live");
  });

  it("returns null for unknown names", () => {
    expect(findState("banana")).toBeNull();
  });
});

describe("renderUnknownState", () => {
  it("points at the list of valid states, in the requested language", () => {
    const en = stripAnsi(renderUnknownState("banana", "en"));
    expect(en).toContain('unknown state "banana"');
    for (const state of RELEASE_STATES) expect(en).toContain(state);

    const ko = stripAnsi(renderUnknownState("banana", "ko"));
    expect(ko).toContain('"banana"');
    expect(ko).toContain("알 수 없는 상태");
  });
});
