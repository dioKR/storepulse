import { describe, expect, it } from "vitest";
import { extractLangFlag, resolveLang } from "./lang.js";

describe("extractLangFlag", () => {
  it("pulls --lang <value> out of argv, leaving the rest intact", () => {
    expect(extractLangFlag(["demo", "--lang", "ko"])).toEqual({ flag: "ko", rest: ["demo"] });
    expect(extractLangFlag(["--lang", "ko", "serve", "--demo"])).toEqual({
      flag: "ko",
      rest: ["serve", "--demo"],
    });
  });

  it("supports --lang=<value>", () => {
    expect(extractLangFlag(["explain", "--lang=en"])).toEqual({ flag: "en", rest: ["explain"] });
  });

  it("returns argv unchanged when the flag is absent", () => {
    expect(extractLangFlag(["snapshot", "--demo"])).toEqual({ rest: ["snapshot", "--demo"] });
  });

  it("treats a trailing --lang without value as an empty flag", () => {
    expect(extractLangFlag(["demo", "--lang"])).toEqual({ flag: "", rest: ["demo"] });
  });
});

describe("resolveLang — priority --lang > STOREPULSE_LANG > OS locale > en", () => {
  it("prefers the explicit flag over everything", () => {
    expect(resolveLang("ko", { STOREPULSE_LANG: "en", LANG: "en_US.UTF-8" })).toBe("ko");
  });

  it("falls back to STOREPULSE_LANG", () => {
    expect(resolveLang(undefined, { STOREPULSE_LANG: "ko", LANG: "en_US.UTF-8" })).toBe("ko");
  });

  it("falls back to the OS locale, LC_ALL > LC_MESSAGES > LANG", () => {
    expect(resolveLang(undefined, { LC_ALL: "ko_KR.UTF-8", LANG: "en_US.UTF-8" })).toBe("ko");
    expect(resolveLang(undefined, { LC_MESSAGES: "ko_KR.UTF-8", LANG: "en_US.UTF-8" })).toBe("ko");
    expect(resolveLang(undefined, { LANG: "ko_KR.UTF-8" })).toBe("ko");
  });

  it("defaults to English when nothing matches", () => {
    expect(resolveLang(undefined, {})).toBe("en");
    expect(resolveLang(undefined, { LANG: "C" })).toBe("en");
    expect(resolveLang(undefined, { LANG: "ja_JP.UTF-8" })).toBe("en");
  });

  it("lets unsupported values fall through to the next source", () => {
    expect(resolveLang("fr", { STOREPULSE_LANG: "ko" })).toBe("ko");
    expect(resolveLang(undefined, { STOREPULSE_LANG: "xx", LANG: "ko_KR.UTF-8" })).toBe("ko");
  });
});
