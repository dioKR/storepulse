import type { Localized } from "./types.js";

/**
 * UI strings for the CLI and the web dashboard.
 * `{name}` placeholders are filled by `uiString()` (CLI) or the dashboard's `t()`.
 * In dashboard strings, `backtick` segments are rendered as <code>.
 *
 * Badges, column headers and channel names stay English on purpose — they are
 * terms, not prose (issue #17), and fixed-width columns keep their alignment.
 */
export const UI_STRINGS = {
  // ── CLI ──────────────────────────────────────────────
  "cli.hint.explain": {
    en: "state meanings: storepulse explain",
    ko: "상태 의미 설명: storepulse explain",
  },
  "cli.error.unknownCommand": {
    en: 'Unknown command "{command}".',
    ko: '"{command}"은(는) 알 수 없는 명령입니다.',
  },
  "cli.help.default": {
    en: "show the release board for storepulse.config.json",
    ko: "storepulse.config.json의 릴리즈 보드를 표시",
  },
  "cli.help.demo": {
    en: "show the board with sample data (no credentials needed)",
    ko: "샘플 데이터로 보드를 표시 (크리덴셜 불필요)",
  },
  "cli.help.snapshot": {
    en: "print the board as JSON (--demo, --out <file>)",
    ko: "보드를 JSON으로 출력 (--demo, --out <file>)",
  },
  "cli.help.serve": {
    en: "local web dashboard (--demo, --port, --host, --refresh)",
    ko: "로컬 웹 대시보드 (--demo, --port, --host, --refresh)",
  },
  "cli.help.explain": {
    en: "explain release states (explain [state])",
    ko: "릴리즈 상태 설명 (explain [state])",
  },
  "cli.help.lang": {
    en: "output language (also: STOREPULSE_LANG, OS locale)",
    ko: "출력 언어 (STOREPULSE_LANG, OS 로케일도 지원)",
  },
  "snapshot.written": {
    en: "snapshot written to {path}",
    ko: "스냅샷을 {path}에 저장했습니다",
  },
  "serve.started": {
    en: "dashboard on {url}  (api: /api/status, {mode})",
    ko: "대시보드 실행 중: {url}  (api: /api/status, {mode})",
  },
  "serve.modeDemo": { en: "demo data", ko: "데모 데이터" },
  "serve.modeRefresh": { en: "refresh <= {seconds}s", ko: "새로고침 <= {seconds}초" },
  "serve.bindWarning": {
    en: "warning — binding to {host} exposes your release board beyond this machine",
    ko: "경고 — {host} 바인딩은 릴리즈 보드를 이 컴퓨터 밖으로 노출합니다",
  },
  "serve.dashboardMissing": {
    en:
      "dashboard assets not found — in the monorepo run `pnpm build` first " +
      "(they are bundled with the published storepulse package)",
    ko:
      "대시보드 자산을 찾을 수 없습니다 — 모노레포에서는 먼저 `pnpm build`를 실행하세요 " +
      "(배포된 storepulse 패키지에는 포함되어 있습니다)",
  },

  // ── explain (shared: CLI `storepulse explain` + dashboard badge panel) ──
  "explain.title": { en: "release states", ko: "릴리즈 상태" },
  "explain.legendHint": {
    en: "storepulse explain <state> shows store states and the recommended action.",
    ko: "storepulse explain <state> 로 스토어 원본 상태와 권장 액션을 볼 수 있습니다.",
  },
  "explain.meaning": { en: "meaning", ko: "의미" },
  "explain.rawStates": { en: "store states", ko: "스토어 원본 상태" },
  "explain.action": { en: "recommended action", ko: "권장 액션" },
  "explain.unknownState": {
    en: 'unknown state "{state}" — available states:',
    ko: '"{state}"은(는) 알 수 없는 상태입니다 — 사용 가능한 상태:',
  },

  // ── dashboard ────────────────────────────────────────
  "dash.loading": { en: "loading status.json…", ko: "status.json 불러오는 중…" },
  "dash.noData": { en: "· no data", ko: "· 데이터 없음" },
  "dash.retrying": { en: "retrying every {seconds}s", ko: "{seconds}초마다 재시도" },
  "dash.loadErrorTitle": {
    en: "could not load {url}",
    ko: "{url}을(를) 불러오지 못했습니다",
  },
  "dash.loadErrorServe": {
    en: "serve mode: check the terminal running `storepulse serve`.",
    ko: "serve 모드: `storepulse serve`를 실행 중인 터미널을 확인하세요.",
  },
  "dash.loadErrorStatic": {
    en:
      "static mode: generate a snapshot with `storepulse snapshot --demo --out status.json` " +
      "and place it next to index.html.",
    ko:
      "static 모드: `storepulse snapshot --demo --out status.json` 으로 스냅샷을 만들어 " +
      "index.html 옆에 두세요.",
  },
  "dash.emptyTitle": { en: "no apps in this snapshot", ko: "스냅샷에 앱이 없습니다" },
  "dash.emptyBody": {
    en: "add apps to `storepulse.config.json` and regenerate.",
    ko: "`storepulse.config.json`에 앱을 추가하고 다시 생성하세요.",
  },
  "dash.schemaWarnTitle": {
    en: "snapshot schemaVersion {version}",
    ko: "스냅샷 schemaVersion {version}",
  },
  "dash.schemaWarnBody": {
    en: "this dashboard understands version {supported} — rendering best-effort.",
    ko: "이 대시보드는 버전 {supported}을 이해합니다 — 가능한 범위에서 렌더링합니다.",
  },
  "dash.filterEmpty": {
    en: "no apps match the current filter",
    ko: "현재 필터에 맞는 앱이 없습니다",
  },
  "dash.filterAll": { en: "All", ko: "전체" },
  "dash.filterOs": { en: "os", ko: "OS" },
  "dash.filterGroup": { en: "group", ko: "그룹" },
  "dash.filterByOs": { en: "filter by os", ko: "OS 필터" },
  "dash.filterByGroup": { en: "filter by group", ko: "그룹 필터" },
  "dash.targets": { en: "{n} targets", ko: "타깃 {n}개" },
  "dash.targetsFiltered": { en: "{shown}/{total} targets", ko: "타깃 {shown}/{total}개" },
  "dash.autoRefresh": { en: "auto-refresh {seconds}s", ko: "자동 새로고침 {seconds}초" },
  "dash.rowDetails": { en: "{name} {os} details", ko: "{name} {os} 상세" },
  "dash.expired": { en: "EXPIRED ({date})", ko: "만료됨 ({date})" },
  "dash.kvDate": { en: "date", ko: "날짜" },
  "dash.kvExpires": { en: "expires", ko: "만료" },
  "dash.kvBuild": { en: "build", ko: "빌드" },
  "dash.kvState": { en: "state", ko: "상태" },
  "dash.kvRollout": { en: "rollout", ko: "롤아웃" },
  "dash.langLabel": { en: "language", ko: "언어" },
  "dash.explainBadge": { en: "explain {badge}", ko: "{badge} 설명" },
  "dash.explainClose": { en: "close", ko: "닫기" },
} as const satisfies Record<string, Localized>;

export type UiKey = keyof typeof UI_STRINGS;
