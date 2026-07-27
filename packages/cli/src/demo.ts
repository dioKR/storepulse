import { type AppTarget, type ChannelStatus, MockConnector } from "@storepulse/core";

export const demoTargets: AppTarget[] = [
  { key: "aurora-ios", name: "Aurora", group: "prod", platform: "ios", storeId: "1" },
  {
    key: "aurora-android",
    name: "Aurora",
    group: "prod",
    platform: "android",
    storeId: "com.example.aurora",
  },
  { key: "aurora-dev-ios", name: "Aurora Dev", group: "dev", platform: "ios", storeId: "2" },
  {
    key: "aurora-dev-android",
    name: "Aurora Dev",
    group: "dev",
    platform: "android",
    storeId: "com.example.aurora.dev",
  },
  { key: "borealis-ios", name: "Borealis", group: "prod", platform: "ios", storeId: "3" },
  {
    key: "borealis-android",
    name: "Borealis",
    group: "prod",
    platform: "android",
    storeId: "com.example.borealis",
  },
  { key: "borealis-dev-ios", name: "Borealis Dev", group: "dev", platform: "ios", storeId: "4" },
  {
    key: "borealis-dev-android",
    name: "Borealis Dev",
    group: "dev",
    platform: "android",
    storeId: "com.example.borealis.dev",
  },
];

const fixtures: Record<string, ChannelStatus[]> = {
  "aurora-ios": [
    { channel: "production", version: "2.4.1", state: "live", rawState: "READY_FOR_SALE" },
    { channel: "production", version: "2.5.0", state: "in-review", rawState: "IN_REVIEW" },
    { channel: "beta", version: "2.5.0", build: "108", state: "live", rawState: "VALID" },
  ],
  "aurora-android": [
    {
      channel: "production",
      version: "2.4.1",
      build: "241",
      state: "rollout",
      rawState: "production/inProgress",
      rolloutPercent: 50,
    },
    { channel: "beta", version: "2.5.0", build: "250", state: "live", rawState: "beta/completed" },
    {
      channel: "internal",
      version: "2.5.1",
      build: "251",
      state: "draft",
      rawState: "internal/draft",
    },
  ],
  "aurora-dev-ios": [
    { channel: "beta", version: "2.6.0", build: "12", state: "live", rawState: "VALID" },
  ],
  "aurora-dev-android": [
    {
      channel: "internal",
      version: "2.6.0",
      build: "12",
      state: "live",
      rawState: "internal/completed",
    },
  ],
  "borealis-ios": [
    { channel: "production", version: "1.9.2", state: "live", rawState: "READY_FOR_SALE" },
    { channel: "production", version: "1.9.3", state: "rejected", rawState: "REJECTED" },
    { channel: "beta", version: "1.9.3", build: "87", state: "live", rawState: "VALID" },
  ],
  "borealis-android": [
    {
      channel: "production",
      version: "1.9.2",
      build: "192",
      state: "live",
      rawState: "production/completed",
    },
    { channel: "beta", version: "1.10.0", build: "200", state: "live", rawState: "beta/completed" },
  ],
  "borealis-dev-ios": [
    {
      channel: "beta",
      version: "1.10.0",
      build: "45",
      state: "in-review",
      rawState: "WAITING_FOR_BETA_REVIEW",
    },
  ],
  "borealis-dev-android": [
    {
      channel: "internal",
      version: "1.10.0",
      build: "45",
      state: "live",
      rawState: "internal/completed",
    },
  ],
};

export const demoConnector = new MockConnector(fixtures);
