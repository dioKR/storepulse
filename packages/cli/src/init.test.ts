import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SUPPORTED_LANGS, UI_STRINGS, type UiKey, uiString } from "@storepulse/core";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace, renderInitReport } from "./init.js";
import { CONFIG_TEMPLATE, ENV_TEMPLATE, GITIGNORE_ENTRIES } from "./templates.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "storepulse-init-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("embedded templates — sync with the repo example files", () => {
  it("CONFIG_TEMPLATE matches storepulse.config.example.json verbatim", () => {
    const example = readFileSync(join(REPO_ROOT, "storepulse.config.example.json"), "utf8");
    expect(CONFIG_TEMPLATE).toBe(example);
  });

  it("ENV_TEMPLATE matches .env.example verbatim", () => {
    const example = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");
    expect(ENV_TEMPLATE).toBe(example);
  });

  it("keeps the least-privilege security guidance in the .env template", () => {
    expect(ENV_TEMPLATE).toContain("prefer the least privilege");
    expect(ENV_TEMPLATE).toContain('Grant ONLY "View app information"');
    expect(ENV_TEMPLATE).toContain('"View Only" robot token');
  });

  it("config template is valid JSON with the fields loadConfig requires", () => {
    const parsed = JSON.parse(CONFIG_TEMPLATE);
    expect(Array.isArray(parsed.apps)).toBe(true);
    expect(parsed.apps.length).toBeGreaterThan(0);
    for (const app of parsed.apps) {
      for (const field of ["key", "name", "platform", "storeId"]) {
        expect(typeof app[field], field).toBe("string");
      }
      expect(["ios", "android"]).toContain(app.platform);
    }
  });
});

describe("initWorkspace — scaffolding", () => {
  it("creates config, .env and .gitignore in an empty folder", () => {
    const dir = makeTempDir();
    const result = initWorkspace(dir);

    expect(result.files).toEqual([
      { name: "storepulse.config.json", action: "created" },
      { name: ".env", action: "created" },
    ]);
    expect(result.gitignore).toEqual({ action: "created", entries: [...GITIGNORE_ENTRIES] });

    expect(readFileSync(join(dir, "storepulse.config.json"), "utf8")).toBe(CONFIG_TEMPLATE);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe(ENV_TEMPLATE);
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    for (const entry of GITIGNORE_ENTRIES) {
      expect(gitignore).toContain(`\n${entry}`);
    }
    expect(gitignore.endsWith("\n")).toBe(true);
  });

  it("never overwrites existing files — skips them and leaves content intact", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "storepulse.config.json"), '{"apps":[{"key":"mine"}]}');
    writeFileSync(join(dir, ".env"), "ASC_KEY_ID=real-secret\n");

    const result = initWorkspace(dir);

    expect(result.files).toEqual([
      { name: "storepulse.config.json", action: "skipped" },
      { name: ".env", action: "skipped" },
    ]);
    expect(readFileSync(join(dir, "storepulse.config.json"), "utf8")).toBe(
      '{"apps":[{"key":"mine"}]}',
    );
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("ASC_KEY_ID=real-secret\n");
  });

  it("re-running after a fresh init changes nothing", () => {
    const dir = makeTempDir();
    initWorkspace(dir);
    const gitignoreAfterFirst = readFileSync(join(dir, ".gitignore"), "utf8");

    const second = initWorkspace(dir);

    expect(second.files.every((f) => f.action === "skipped")).toBe(true);
    expect(second.gitignore).toEqual({ action: "unchanged", entries: [] });
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(gitignoreAfterFirst);
  });
});

describe("initWorkspace — .gitignore handling", () => {
  it("appends only the missing patterns to an existing .gitignore", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");

    const result = initWorkspace(dir);

    expect(result.gitignore).toEqual({
      action: "appended",
      entries: ["*.p8", "service-account*.json", "storepulse.config.json"],
    });
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore.startsWith("node_modules/\n.env\n")).toBe(true);
    expect(gitignore.match(/^\.env$/gm)).toHaveLength(1); // not duplicated
    expect(gitignore).toContain("*.p8");
    expect(gitignore).toContain("service-account*.json");
    expect(gitignore).toContain("storepulse.config.json");
  });

  it("recognizes patterns despite surrounding whitespace and CRLF", () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, ".gitignore"),
      "  .env  \r\n*.p8\r\nservice-account*.json\r\nstorepulse.config.json\r\n",
    );

    expect(initWorkspace(dir).gitignore).toEqual({ action: "unchanged", entries: [] });
  });

  it("repairs a .gitignore that does not end with a newline", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, ".gitignore"), "node_modules/"); // no trailing newline

    initWorkspace(dir);

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^node_modules\/\n/); // old last line stays its own line
    for (const entry of GITIGNORE_ENTRIES) {
      expect(gitignore).toContain(`\n${entry}`);
    }
  });
});

describe("init i18n — dictionary completeness", () => {
  const INIT_KEYS = [
    "cli.help.init",
    "init.created",
    "init.skipped",
    "init.gitignoreCreated",
    "init.gitignoreAppended",
    "init.gitignoreUnchanged",
    "init.nextSteps",
    "init.stepConfig",
    "init.stepKeys",
    "init.stepRun",
  ] as const satisfies readonly UiKey[];

  it.each(INIT_KEYS)("%s exists in every supported language, non-empty", (key) => {
    for (const lang of SUPPORTED_LANGS) {
      expect(UI_STRINGS[key][lang].trim().length, `${key}.${lang}`).toBeGreaterThan(0);
    }
  });

  it("points each language at its own tutorial page", () => {
    expect(uiString("init.stepKeys", "en")).toContain("https://diokr.github.io/storepulse/");
    expect(uiString("init.stepKeys", "ko")).toContain("https://diokr.github.io/storepulse/ko/");
  });
});

describe("renderInitReport", () => {
  it("lists created files, the gitignore action and the numbered next steps", () => {
    const dir = makeTempDir();
    const report = renderInitReport(initWorkspace(dir), "en");

    expect(report).toContain("created storepulse.config.json");
    expect(report).toContain("created .env");
    expect(report).toContain("created .gitignore");
    expect(report).toContain("1. ");
    expect(report).toContain("2. ");
    expect(report).toContain("3. ");
    expect(report).toContain("npx storepulse");
  });

  it("warns about skipped files instead of overwriting", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, ".env"), "KEEP=1\n");

    const report = renderInitReport(initWorkspace(dir), "en");

    expect(report).toContain(".env already exists — skipped");
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("KEEP=1\n");
  });

  it("renders in Korean when asked", () => {
    const dir = makeTempDir();
    const report = renderInitReport(initWorkspace(dir), "ko");

    expect(report).toContain("생성했습니다");
    expect(report).toContain("다음 단계");
    expect(report).toContain("https://diokr.github.io/storepulse/ko/");
    expect(existsSync(join(dir, ".gitignore"))).toBe(true);
  });
});
