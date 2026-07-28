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

/**
 * Demo dates are relative to "now" so the board always looks alive and the
 * TestFlight expiry D-day (including its ≤7-day warning) stays demoable.
 */
const daysFromNow = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const fixtures: Record<string, ChannelStatus[]> = {
  "aurora-ios": [
    {
      channel: "production",
      version: "2.4.1",
      state: "live",
      rawState: "READY_FOR_SALE",
      date: daysFromNow(-21),
      releaseNotes: "· 홈 피드 로딩 속도 개선\n· 다크 모드 색상 대비 수정\n· 자잘한 버그 수정",
    },
    {
      channel: "production",
      version: "2.5.0",
      state: "in-review",
      rawState: "IN_REVIEW",
      date: daysFromNow(-2),
      releaseNotes: "· 위젯 지원 추가\n· 알림 설정 화면 개편",
    },
    {
      channel: "beta",
      version: "2.5.0",
      build: "108",
      state: "live",
      rawState: "VALID",
      date: daysFromNow(-6),
      expiresAt: daysFromNow(84),
      releaseNotes: "위젯 베타 빌드 — 홈 화면에 추가 후 피드백 부탁드립니다.",
    },
  ],
  "aurora-android": [
    {
      channel: "production",
      version: "2.4.1",
      build: "241",
      state: "rollout",
      rawState: "production/inProgress",
      rolloutPercent: 50,
      releaseNotes: "· 홈 피드 로딩 속도 개선\n· 자잘한 버그 수정",
    },
    {
      channel: "beta",
      version: "2.5.0",
      build: "250",
      state: "live",
      rawState: "beta/completed",
      releaseNotes: "위젯 지원을 먼저 만나보세요.",
    },
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
    {
      channel: "production",
      version: "1.9.2",
      state: "live",
      rawState: "READY_FOR_SALE",
      date: daysFromNow(-60),
      releaseNotes: "Performance improvements and bug fixes.",
    },
    {
      channel: "production",
      version: "1.9.3",
      state: "rejected",
      rawState: "REJECTED",
      date: daysFromNow(-9),
      releaseNotes: "· 로그인 화면 개선\n· 크래시 수정",
    },
    {
      // expiresAt within 7 days → the dashboard detail panel shows a D-day warning
      channel: "beta",
      version: "1.9.3",
      build: "87",
      state: "live",
      rawState: "VALID",
      date: daysFromNow(-86),
      expiresAt: daysFromNow(4),
    },
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
