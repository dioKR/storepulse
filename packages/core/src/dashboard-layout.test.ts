import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JS module shared with the static dashboard
import * as layout from "../../dashboard/src/layout.js";

const {
  displayAppName,
  groupId,
  groupLabel,
  groupAppsByName,
  groupsOf,
  shouldShowGroupSelector,
  UNGROUPED_GROUP,
} = layout;

function app(key: string, name: string, group?: string, platform = "ios") {
  return {
    target: { key, name, group, platform, storeId: key },
    channels: [],
    fetchedAt: "2026-08-13T00:00:00.000Z",
  };
}

describe("dashboard group layout", () => {
  it("normalizes common group labels but preserves custom groups", () => {
    expect(groupLabel("prod", "Other")).toBe("Production");
    expect(groupLabel("DEV", "Other")).toBe("Development");
    expect(groupLabel("staging", "Other")).toBe("staging");
    expect(groupLabel(UNGROUPED_GROUP, "Other")).toBe("Other");
  });

  it("keeps groups in snapshot order and includes ungrouped targets", () => {
    const apps = [
      app("a-prod", "[Prod]A", "prod"),
      app("a-dev", "[Dev]A", "DEV"),
      app("b-prod", "[Production]B", "PRODUCTION"),
      app("b-dev", "[Development]B", "development"),
      app("other", "Other"),
    ];
    expect(groupsOf(apps)).toEqual(["production", "development", UNGROUPED_GROUP]);
    expect(groupId(apps[0].target)).toBe("production");
    expect(groupId(apps[1].target)).toBe("development");
    expect(groupId(apps[4].target)).toBe(UNGROUPED_GROUP);
  });

  it("hides the selector when every target is ungrouped", () => {
    expect(shouldShowGroupSelector(groupsOf([app("a", "A")]))).toBe(false);
    expect(shouldShowGroupSelector(["production"])).toBe(true);
    expect(shouldShowGroupSelector(["production", UNGROUPED_GROUP])).toBe(true);
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
