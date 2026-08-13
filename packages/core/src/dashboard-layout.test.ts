import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JS module shared with the static dashboard
import * as layout from "../../dashboard/src/layout.js";

const {
  displayAppName,
  environmentId,
  environmentLabel,
  environmentsOf,
  groupAppsByName,
  UNGROUPED_ENVIRONMENT,
} = layout;

function app(key: string, name: string, group?: string, platform = "ios") {
  return {
    target: { key, name, group, platform, storeId: key },
    channels: [],
    fetchedAt: "2026-08-13T00:00:00.000Z",
  };
}

describe("dashboard environment layout", () => {
  it("normalizes common environment labels but preserves custom groups", () => {
    expect(environmentLabel("prod", "Other")).toBe("Production");
    expect(environmentLabel("DEV", "Other")).toBe("Development");
    expect(environmentLabel("staging", "Other")).toBe("staging");
    expect(environmentLabel(UNGROUPED_ENVIRONMENT, "Other")).toBe("Other");
  });

  it("keeps environments in snapshot order and includes ungrouped targets", () => {
    const apps = [
      app("a-prod", "[Prod]A", "prod"),
      app("a-dev", "[Dev]A", "dev"),
      app("b-prod", "[Prod]B", "prod"),
      app("other", "Other"),
    ];
    expect(environmentsOf(apps)).toEqual(["prod", "dev", UNGROUPED_ENVIRONMENT]);
    expect(environmentId(apps[3].target)).toBe(UNGROUPED_ENVIRONMENT);
  });
});

describe("dashboard app cards", () => {
  it("removes only the redundant group prefix", () => {
    expect(displayAppName(app("a", "[Prod]BabeChat", "prod").target)).toBe("BabeChat");
    expect(displayAppName(app("b", "[PROD] Tookit", "prod").target)).toBe("Tookit");
    expect(displayAppName(app("c", "Production Tools", "prod").target)).toBe("Production Tools");
    expect(displayAppName(app("d", "[Prod]", "prod").target)).toBe("[Prod]");
  });

  it("groups platform targets into first-seen app cards", () => {
    const babeIos = app("b-ios", "[Prod]BabeChat", "prod", "ios");
    const tookitIos = app("t-ios", "[Prod]Tookit", "prod", "ios");
    const babeAndroid = app("b-android", "[Prod]BabeChat", "prod", "android");

    expect(groupAppsByName([babeIos, tookitIos, babeAndroid])).toEqual([
      { name: "BabeChat", apps: [babeIos, babeAndroid] },
      { name: "Tookit", apps: [tookitIos] },
    ]);
  });
});
