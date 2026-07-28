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
  "cli.help.init": {
    en: "create storepulse.config.json + .env templates here",
    ko: "현재 폴더에 storepulse.config.json + .env 템플릿 생성",
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
  "cli.help.doctor": {
    en: "diagnose credentials & permissions (find the 401/403)",
    ko: "크리덴셜·권한 진단 (401/403 원인 찾기)",
  },
  "cli.help.lang": {
    en: "output language (also: STOREPULSE_LANG, OS locale)",
    ko: "출력 언어 (STOREPULSE_LANG, OS 로케일도 지원)",
  },
  // ── init (storepulse init, issue #9) ─────────────────
  "init.created": {
    en: "created {file}",
    ko: "{file}을(를) 생성했습니다",
  },
  "init.skipped": {
    en: "{file} already exists — skipped (never overwritten)",
    ko: "{file}이(가) 이미 있어 건너뜁니다 (덮어쓰지 않습니다)",
  },
  "init.gitignoreCreated": {
    en: "created .gitignore ignoring {entries}",
    ko: ".gitignore를 생성해 {entries}을(를) 무시하도록 했습니다",
  },
  "init.gitignoreAppended": {
    en: "appended {entries} to .gitignore",
    ko: ".gitignore에 {entries}을(를) 추가했습니다",
  },
  "init.gitignoreUnchanged": {
    en: ".gitignore already ignores all credential files",
    ko: ".gitignore가 이미 모든 크리덴셜 파일을 무시하고 있습니다",
  },
  "init.nextSteps": { en: "next steps", ko: "다음 단계" },
  "init.stepConfig": {
    en:
      "add your apps to storepulse.config.json — storeId is the numeric Apple ID " +
      "on the App Store Connect app page (ios) or the package name (android)",
    ko:
      "storepulse.config.json에 앱 정보를 입력하세요 — storeId는 App Store Connect " +
      "앱 페이지의 숫자 Apple ID(ios) 또는 패키지명(android)입니다",
  },
  "init.stepKeys": {
    en: "issue read-only store API keys — tutorial: https://diokr.github.io/storepulse/",
    ko: "스토어 API 키를 발급하세요 — 튜토리얼: https://diokr.github.io/storepulse/ko/",
  },
  "init.stepRun": {
    en: "when both are done, run: npx storepulse",
    ko: "완료되면 실행: npx storepulse",
  },

  // ── doctor (storepulse doctor, issue #6) ─────────────
  "doctor.title": {
    en: "credential & permission checkup",
    ko: "크리덴셜·권한 진단",
  },
  "doctor.section.config": {
    en: "config file (storepulse.config.json)",
    ko: "설정 파일 (storepulse.config.json)",
  },
  "doctor.section.env": {
    en: "secrets (.env / environment)",
    ko: "시크릿 (.env / 환경변수)",
  },
  "doctor.section.apple": {
    en: "App Store Connect chain",
    ko: "App Store Connect 체인",
  },
  "doctor.section.google": {
    en: "Google Play chain",
    ko: "Google Play 체인",
  },
  "doctor.section.eas": {
    en: "Expo (EAS) chain — optional",
    ko: "Expo (EAS) 체인 — 선택",
  },
  "doctor.section.summary": { en: "summary", ko: "요약" },

  // [1] config
  "doctor.config.exists": { en: "config file exists", ko: "설정 파일 존재" },
  "doctor.config.parse": { en: "valid JSON", ko: "올바른 JSON 형식" },
  "doctor.config.fields": {
    en: "app entries have key/name/platform/storeId",
    ko: "앱 항목에 key/name/platform/storeId 존재",
  },
  "doctor.config.appsCount": { en: "{n} app(s)", ko: "앱 {n}개" },
  "doctor.config.notFound": {
    en: "storepulse.config.json not found in {cwd}",
    ko: "{cwd}에 storepulse.config.json이 없습니다",
  },
  "doctor.config.parseError": {
    en: "JSON parse failed: {message}",
    ko: "JSON 파싱 실패: {message}",
  },
  "doctor.config.appsMissing": {
    en: '"apps" must be a non-empty array',
    ko: '"apps"는 비어 있지 않은 배열이어야 합니다',
  },
  "doctor.config.fieldMissing": {
    en: 'app entry {app} is missing "{field}"',
    ko: '앱 항목 {app}에 "{field}"가 없습니다',
  },
  "doctor.config.badPlatform": {
    en: 'platform must be "ios" or "android", got "{platform}"',
    ko: 'platform은 "ios" 또는 "android"여야 합니다 (현재 "{platform}")',
  },
  "doctor.config.badEasProjectId": {
    en: 'app entry {app} has a non-string or empty "easProjectId"',
    ko: '앱 항목 {app}의 "easProjectId"가 문자열이 아니거나 비어 있습니다',
  },
  "doctor.fix.init": {
    en: "run `storepulse init` to scaffold the config + .env templates",
    ko: "`storepulse init`으로 설정 파일 + .env 템플릿을 생성하세요",
  },
  "doctor.fix.config": {
    en: "fix storepulse.config.json — the tutorial shows the expected shape",
    ko: "storepulse.config.json을 수정하세요 — 올바른 형식은 튜토리얼 참고",
  },

  // [2] secrets
  "doctor.env.ascKey": {
    en: "ASC private key (ASC_PRIVATE_KEY_PATH or _BASE64)",
    ko: "ASC 개인 키 (ASC_PRIVATE_KEY_PATH 또는 _BASE64)",
  },
  "doctor.env.playSa": {
    en: "Play service account (PLAY_SERVICE_ACCOUNT_PATH or _BASE64)",
    ko: "Play 서비스 계정 (PLAY_SERVICE_ACCOUNT_PATH 또는 _BASE64)",
  },
  "doctor.env.missing": { en: "not set", ko: "설정되지 않음" },
  "doctor.env.placeholder": {
    en: "still the placeholder from `storepulse init` — put your real value",
    ko: "`storepulse init`의 플레이스홀더 값 그대로입니다 — 실제 값을 입력하세요",
  },
  "doctor.env.fileMissing": {
    en: "file not found: {path}",
    ko: "파일이 없습니다: {path}",
  },
  "doctor.fix.envAsc": {
    en: "fill in the App Store Connect section of .env (tutorial step 3)",
    ko: ".env의 App Store Connect 섹션을 채우세요 (튜토리얼 3단계)",
  },
  "doctor.fix.envPlay": {
    en: "fill in the Google Play section of .env (tutorial step 4)",
    ko: ".env의 Google Play 섹션을 채우세요 (튜토리얼 4단계)",
  },

  // skip reasons
  "doctor.skip.noIosApps": {
    en: "skipped — no ios apps in the config",
    ko: "건너뜀 — 설정에 ios 앱이 없습니다",
  },
  "doctor.skip.noAndroidApps": {
    en: "skipped — no android apps in the config",
    ko: "건너뜀 — 설정에 android 앱이 없습니다",
  },
  "doctor.skip.configFirst": {
    en: "skipped — fix the config check [1] first",
    ko: "건너뜀 — 설정 파일 진단 [1]을 먼저 해결하세요",
  },
  "doctor.skip.envFirst": {
    en: "skipped — fix the secrets check [2] first",
    ko: "건너뜀 — 시크릿 진단 [2]를 먼저 해결하세요",
  },
  "doctor.skip.prevFailed": {
    en: "skipped — a previous check in this chain failed",
    ko: "건너뜀 — 이 체인의 이전 진단이 실패했습니다",
  },

  // [3] App Store Connect chain
  "doctor.asc.p8": { en: "parse .p8 key & sign JWT", ko: ".p8 키 파싱 & JWT 서명" },
  "doctor.asc.p8Fail": {
    en: "cannot parse the .p8 key ({message}) — the key file is damaged or not a .p8",
    ko: ".p8 키를 파싱할 수 없습니다 ({message}) — 키 파일이 손상되었거나 .p8이 아닙니다",
  },
  "doctor.fix.p8": {
    en: "download the API key (.p8) again from App Store Connect and point ASC_PRIVATE_KEY_PATH at it",
    ko: "App Store Connect에서 API 키(.p8)를 다시 내려받아 ASC_PRIVATE_KEY_PATH로 지정하세요",
  },
  "doctor.asc.token": {
    en: "token accepted by the ASC API (GET /v1/apps)",
    ko: "ASC API 토큰 인증 (GET /v1/apps)",
  },
  "doctor.asc.401": {
    en: "401 — Key ID / Issuer ID don't match this key, or the key was revoked",
    ko: "401 — Key ID·Issuer ID가 이 키와 일치하지 않거나 키가 폐기되었습니다",
  },
  "doctor.fix.asc401": {
    en: "compare ASC_KEY_ID / ASC_ISSUER_ID with App Store Connect → Users and Access → Integrations, or issue a new key",
    ko: "App Store Connect → 사용자 및 액세스 → 통합에서 ASC_KEY_ID / ASC_ISSUER_ID를 대조하거나 새 키를 발급하세요",
  },
  "doctor.asc.status": {
    en: "ASC API returned {status}",
    ko: "ASC API가 {status}을(를) 반환했습니다",
  },
  "doctor.check.app": { en: "app {name} ({storeId})", ko: "앱 {name} ({storeId})" },
  "doctor.asc.app404": {
    en: "404 — wrong storeId, or this key's role cannot see the app",
    ko: "404 — storeId가 잘못되었거나 이 키의 롤이 해당 앱에 접근할 수 없습니다",
  },
  "doctor.fix.ascApp": {
    en: "storeId must be the numeric Apple ID on the ASC app page; also check the key's role / app access",
    ko: "storeId는 ASC 앱 페이지의 숫자 Apple ID여야 합니다; 키의 롤/앱 접근 권한도 확인하세요",
  },

  // [4] Google Play chain
  "doctor.play.sa": { en: "parse service account JSON", ko: "서비스 계정 JSON 파싱" },
  "doctor.play.saParseFail": {
    en: "service account JSON is invalid: {message}",
    ko: "서비스 계정 JSON이 유효하지 않습니다: {message}",
  },
  "doctor.play.saFields": {
    en: "service account JSON is missing client_email / a PEM private_key",
    ko: "서비스 계정 JSON에 client_email 또는 PEM 형식 private_key가 없습니다",
  },
  "doctor.fix.sa": {
    en: "download a fresh service-account key JSON from Google Cloud → IAM → Service Accounts",
    ko: "Google Cloud → IAM → 서비스 계정에서 키 JSON을 새로 내려받으세요",
  },
  "doctor.play.token": { en: "OAuth token exchange", ko: "OAuth 토큰 교환" },
  "doctor.play.invalidGrant": {
    en: "invalid_grant — the key was deleted/disabled, or this machine's clock is off",
    ko: "invalid_grant — 키가 삭제·비활성화되었거나 이 컴퓨터의 시계가 어긋나 있습니다",
  },
  "doctor.fix.invalidGrant": {
    en: "create a new key for the service account and sync the system clock",
    ko: "서비스 계정 키를 새로 만들고 시스템 시계를 동기화하세요",
  },
  "doctor.play.tokenStatus": {
    en: "token endpoint returned {status}",
    ko: "토큰 엔드포인트가 {status}을(를) 반환했습니다",
  },
  "doctor.play.apiDisabled": {
    en: "403 — the Android Publisher API is disabled in this key's Cloud project",
    ko: "403 — 이 키의 Cloud 프로젝트에서 Android Publisher API가 비활성화되어 있습니다",
  },
  "doctor.fix.apiDisabled": {
    en: 'enable "Google Play Android Developer API" in the Google Cloud console, wait a minute, retry',
    ko: 'Google Cloud 콘솔에서 "Google Play Android Developer API"를 활성화하고 잠시 후 다시 시도하세요',
  },
  "doctor.play.403": {
    en: "403 — the service account is not invited to Play Console, or lacks permission",
    ko: "403 — 서비스 계정이 Play Console에 초대되지 않았거나 권한이 부족합니다",
  },
  "doctor.fix.play403": {
    en: 'Play Console → Users and permissions → invite {email} with "View app information"',
    ko: 'Play Console → 사용자 및 권한에서 {email}을(를) "앱 정보 보기" 권한으로 초대하세요',
  },
  "doctor.play.404": {
    en: "404 — wrong package name, or the app has no release history yet",
    ko: "404 — 패키지명이 잘못되었거나 아직 릴리즈 이력이 없는 앱입니다",
  },
  "doctor.fix.play404": {
    en: "storeId must be the applicationId shown in Play Console, and the app needs at least one release",
    ko: "storeId는 Play Console에 표시되는 applicationId여야 하며, 앱에 릴리즈가 최소 한 번 있어야 합니다",
  },
  "doctor.play.status": {
    en: "Play API returned {status}",
    ko: "Play API가 {status}을(를) 반환했습니다",
  },

  // [5] Expo (EAS) chain — optional enrichment
  "doctor.skip.noEas": {
    en: "skipped — no easProjectId in the config and EAS_TOKEN not set (EAS is optional)",
    ko: "건너뜀 — 설정에 easProjectId가 없고 EAS_TOKEN도 설정되지 않았습니다 (EAS는 선택입니다)",
  },
  "doctor.skip.noEasProjects": {
    en: "no easProjectId in the config — nothing to enrich",
    ko: "설정에 easProjectId가 없습니다 — 보강할 대상이 없습니다",
  },
  "doctor.skip.easTokenFirst": {
    en: "skipped — set EAS_TOKEN first",
    ko: "건너뜀 — 먼저 EAS_TOKEN을 설정하세요",
  },
  "doctor.fix.envEas": {
    en:
      "create an access token at https://expo.dev/settings/access-tokens and set EAS_TOKEN in .env " +
      "(for organizations, prefer a View Only robot token)",
    ko:
      "https://expo.dev/settings/access-tokens 에서 액세스 토큰을 만들어 .env의 EAS_TOKEN에 넣으세요 " +
      "(조직은 View Only 로봇 토큰 권장)",
  },
  "doctor.eas.viewer": {
    en: "token accepted by the EAS GraphQL API (CurrentUser)",
    ko: "EAS GraphQL API 토큰 인증 (CurrentUser)",
  },
  "doctor.eas.viewerAs": { en: "authenticated as {name}", ko: "{name}(으)로 인증됨" },
  "doctor.eas.viewerFail": {
    en: "EAS rejected the token: {message}",
    ko: "EAS가 토큰을 거부했습니다: {message}",
  },
  "doctor.fix.easToken": {
    en: "the token is invalid or revoked — issue a new one at https://expo.dev/settings/access-tokens",
    ko: "토큰이 유효하지 않거나 폐기되었습니다 — https://expo.dev/settings/access-tokens 에서 새로 발급하세요",
  },
  "doctor.check.easProject": { en: "project {projectId}", ko: "프로젝트 {projectId}" },
  "doctor.eas.projectFail": {
    en: "cannot access this project: {message}",
    ko: "이 프로젝트에 접근할 수 없습니다: {message}",
  },
  "doctor.fix.easProject": {
    en:
      "easProjectId must be the EAS project ID (app.json → extra.eas.projectId), " +
      "and the token's account needs access to that project",
    ko:
      "easProjectId는 EAS 프로젝트 ID(app.json → extra.eas.projectId)여야 하며, " +
      "토큰 계정이 해당 프로젝트에 접근할 수 있어야 합니다",
  },

  // shared
  "doctor.fail.network": {
    en: "network error: {message}",
    ko: "네트워크 오류: {message}",
  },
  "doctor.fix.network": {
    en: "check your internet connection / proxy and retry",
    ko: "인터넷 연결/프록시를 확인하고 다시 시도하세요",
  },

  // [5] summary
  "doctor.summary.ok": {
    en: "all checks passed — you're good to go",
    ko: "모든 진단을 통과했습니다 — 바로 사용할 수 있습니다",
  },
  "doctor.summary.fail": {
    en: "{n} check(s) failed",
    ko: "실패한 진단 {n}개",
  },
  "doctor.summary.tutorial": {
    en: "tutorial: https://diokr.github.io/storepulse/tutorial/",
    ko: "튜토리얼: https://diokr.github.io/storepulse/ko/tutorial/",
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
  "dash.easTitle": { en: "EAS build", ko: "EAS 빌드" },
  "dash.kvEasProfile": { en: "profile", ko: "프로필" },
  "dash.kvEasCommit": { en: "commit", ko: "커밋" },
  "dash.kvEasCompleted": { en: "built", ko: "빌드 완료" },
  "dash.kvEasSubmission": { en: "submission", ko: "제출 상태" },
  "dash.langLabel": { en: "language", ko: "언어" },
  "dash.explainBadge": { en: "explain {badge}", ko: "{badge} 설명" },
  "dash.explainClose": { en: "close", ko: "닫기" },
} as const satisfies Record<string, Localized>;

export type UiKey = keyof typeof UI_STRINGS;
