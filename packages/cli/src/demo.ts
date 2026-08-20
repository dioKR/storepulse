import { type AppTarget, type ChannelStatus, MockConnector } from "@storepulse/core";

// Aurora is an Expo app — its ios/android targets share one EAS projectId,
// so the demo shows the EAS block in the dashboard detail panel.
const AURORA_EAS_PROJECT_ID = "5b2fb1e0-6c2a-4b8e-9d3f-4a1c2e8f7a90";

export const demoTargets: AppTarget[] = [
  {
    key: "aurora-ios",
    name: "Aurora",
    group: "prod",
    platform: "ios",
    storeId: "1",
    easProjectId: AURORA_EAS_PROJECT_ID,
  },
  {
    key: "aurora-android",
    name: "Aurora",
    group: "prod",
    platform: "android",
    storeId: "com.example.aurora",
    latestTesterUrl: "https://example.com/aurora/android/latest",
    installLinks: {
      "241": "https://example.com/aurora/android/241",
      "250": "https://example.com/aurora/android/250",
      "251": "https://example.com/aurora/android/251",
    },
    easProjectId: AURORA_EAS_PROJECT_ID,
  },
  { key: "aurora-dev-ios", name: "Aurora Dev", group: "dev", platform: "ios", storeId: "2" },
  {
    key: "aurora-dev-android",
    name: "Aurora Dev",
    group: "dev",
    platform: "android",
    storeId: "com.example.aurora.dev",
    installLinks: { "12": "https://example.com/aurora-dev/android/12" },
  },
  { key: "borealis-ios", name: "Borealis", group: "prod", platform: "ios", storeId: "3" },
  {
    key: "borealis-android",
    name: "Borealis",
    group: "prod",
    platform: "android",
    storeId: "com.example.borealis",
    latestTesterUrl: "https://example.com/borealis/android/latest",
    installLinks: {
      "192": "https://example.com/borealis/android/192",
      "200": "https://example.com/borealis/android/200",
    },
  },
  { key: "borealis-dev-ios", name: "Borealis Dev", group: "dev", platform: "ios", storeId: "4" },
  {
    key: "borealis-dev-android",
    name: "Borealis Dev",
    group: "dev",
    platform: "android",
    storeId: "com.example.borealis.dev",
    installLinks: { "45": "https://example.com/borealis-dev/android/45" },
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
      // Same EAS build as the TestFlight row below: on iOS the reviewed
      // binary IS the beta build — that is exactly what the eas block answers.
      eas: {
        profile: "production",
        commit: "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
        buildId: "3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90",
        completedAt: daysFromNow(-3),
        submissionStatus: "FINISHED",
      },
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
      eas: {
        profile: "production",
        commit: "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
        buildId: "3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90",
        completedAt: daysFromNow(-6),
        submissionStatus: "FINISHED",
      },
      easUpdate: {
        groupId: "52c1c6ea-31db-49a5-b178-91e94ea9ab8b",
        branch: "production",
        message: "Fix widget refresh after account switching",
        commit: "a7c4e12f9d2a8b6c1e3f4a5b6c7d8e9f0a1b2c3d",
        createdAt: daysFromNow(-1),
        runtimeVersion: "runtime-ios-108",
      },
    },
  ],
  "aurora-android": [
    {
      channel: "production",
      version: "2.4.1",
      build: "241",
      state: "rollout",
      rawState: "production/inProgress; lifecycle=RELEASE_LIFECYCLE_STATE_PUBLISHED",
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
      // Same commit as the iOS 2.5.0 rows, different (android) EAS build.
      eas: {
        profile: "production",
        commit: "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
        buildId: "a1c4e7f0-2b5d-48a1-9c3e-6f0b2d4a8e17",
        completedAt: daysFromNow(-7),
        submissionStatus: "FINISHED",
      },
    },
    {
      channel: "internal",
      version: "2.5.1",
      build: "251",
      state: "draft",
      rawState: "internal/draft",
      easUpdate: {
        groupId: "a29fba19-8f48-446a-9f52-b3b85036b036",
        branch: "development",
        message: "Tune Android widget background refresh",
        commit: "b8d5f23a0e3b9c7d2f4a5b6c7d8e9f0a1b2c3d4e",
        createdAt: daysFromNow(-1),
        runtimeVersion: "runtime-android-251",
        rolloutPercentage: 50,
      },
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
