import { describe, expect, it } from "vitest";
import { validateTargets } from "./config.js";

const androidApp = {
  key: "app-android",
  name: "App",
  platform: "android",
  storeId: "com.example.app",
};

describe("Android install link config", () => {
  it("accepts a fixed latest link and verified links keyed by versionCode", () => {
    const target = {
      ...androidApp,
      latestTesterUrl: "https://play.google.com/apps/internaltest/1234567890",
      installLinks: {
        "41": "https://play.google.com/apps/test/com.example.app/41",
      },
    };

    expect(validateTargets({ apps: [target] })).toEqual({ targets: [target] });
  });

  it.each([
    [
      "an iOS target",
      { ...androidApp, platform: "ios", latestTesterUrl: "https://example.com/latest" },
    ],
    ["an HTTP latest link", { ...androidApp, latestTesterUrl: "http://example.com/latest" }],
    [
      "credentials in the latest link",
      { ...androidApp, latestTesterUrl: "https://user:secret@example.com/latest" },
    ],
    ["a non-object link map", { ...androidApp, installLinks: "https://example.com/41" }],
    ["a non-versionCode key", { ...androidApp, installLinks: { preview: "https://example.com" } }],
    ["an unsafe version link", { ...androidApp, installLinks: { "41": "javascript:alert(1)" } }],
  ])("rejects %s without retaining the rejected URL", (_label, target) => {
    const result = validateTargets({ apps: [target] });

    expect(result).toMatchObject({
      issue: { kind: "bad-install-link", appKey: "app-android" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("javascript");
  });

  it("does not retain install credentials when another required field fails first", () => {
    const result = validateTargets({
      apps: [
        {
          key: "app-android",
          platform: "android",
          storeId: "com.example.app",
          latestTesterUrl: "https://private-user:private-secret@example.com/latest",
        },
      ],
    });

    expect(result).toEqual({
      issue: { kind: "field-missing", appKey: "app-android", field: "name" },
    });
    expect(JSON.stringify(result)).not.toContain("private-user");
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
});
