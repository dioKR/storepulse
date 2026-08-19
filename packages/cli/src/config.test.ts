import { describe, expect, it } from "vitest";
import { validateTargets } from "./config.js";

const androidApp = {
  key: "app-android",
  name: "App",
  platform: "android",
  storeId: "com.example.app",
};

describe("installUrlTemplate config", () => {
  it("accepts an Android HTTPS template with store and build placeholders", () => {
    const result = validateTargets({
      apps: [
        {
          ...androidApp,
          installUrlTemplate: "https://play.google.com/apps/test/{storeId}/{build}",
        },
      ],
    });

    expect(result).toEqual({
      targets: [
        {
          ...androidApp,
          installUrlTemplate: "https://play.google.com/apps/test/{storeId}/{build}",
        },
      ],
    });
  });

  it.each([
    ["iOS target", { ...androidApp, platform: "ios" }, "https://example.com/{storeId}/{build}"],
    ["HTTP URL", androidApp, "http://example.com/{storeId}/{build}"],
    ["missing storeId", androidApp, "https://example.com/build/{build}"],
    ["missing build", androidApp, "https://example.com/app/{storeId}"],
    ["embedded credentials", androidApp, "https://user:password@example.com/{storeId}/{build}"],
  ])("rejects %s", (_label, base, installUrlTemplate) => {
    const result = validateTargets({
      apps: [{ ...base, installUrlTemplate }],
    });

    expect(result).toMatchObject({ issue: { kind: "bad-install-url-template" } });
  });
});
