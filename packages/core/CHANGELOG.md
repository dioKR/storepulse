# @storepulse/core

## 0.6.0

### Minor Changes

- 6e70ae4: `storepulse doctor` 신규 명령 — 크리덴셜·권한 사전 진단 (#6)

  - 온보딩에서 가장 자주 막히는 401/403 원인을 순차 진단 체크리스트(✓/✗/–)로 자동 판별합니다: [1] 설정 파일 → [2] .env 시크릿 → [3] App Store Connect 체인 → [4] Google Play 체인 → [5] 요약(실패 항목마다 한 줄 해결책 + 언어별 튜토리얼 링크). 실패가 하나라도 있으면 exit 1이며, ios/android 타깃이 없는 축은 스킵으로 표시합니다.
  - Apple 체인은 .p8 파싱·JWT 서명 실패(키 파일 문제), 401(Key ID·Issuer ID 불일치 또는 키 폐기), 특정 앱 404(storeId 오류 또는 키 롤의 앱 접근 불가)를 구분합니다. Google 체인은 invalid_grant(키 삭제·시계 오차), "API disabled/has not been used" 403(Cloud 프로젝트 API 비활성), 그 외 403(Play Console 초대 누락·권한 부족), 404(패키지명 오류·릴리즈 이력 없음)를 응답 본문으로 구분하며, 검사용 edit은 생성 즉시 삭제합니다.
  - `storepulse init` 템플릿의 플레이스홀더 값을 그대로 둔 경우와 키 파일 경로가 존재하지 않는 경우도 짚어 줍니다. 모든 출력은 공유 i18n 사전(en/ko)을 사용하고 전역 `--lang ko|en` 플래그를 지원합니다.
  - @storepulse/core: JWT·토큰 로직 재사용을 위해 `createAscToken(creds)`, `createPlayAccessToken(creds, fetchImpl?)`, `PlayTokenExchangeError`를 공개 API로 export합니다 (커넥터 내부도 동일 헬퍼를 사용하도록 정리 — 중복 구현 없음).

## 0.5.0

## 0.4.0

### Minor Changes

- 8de3d88: i18n 에픽: 공유 번역 사전 + CLI 한국어 + `storepulse explain` + 대시보드 언어 스위처·배지 설명

  - `@storepulse/core`: 공유 i18n 사전 추가 (`SUPPORTED_LANGS`, `normalizeLang`, `UI_STRINGS`, `STATE_EXPLANATIONS`, `uiString`) — ReleaseState별 설명(의미·스토어 원본 상태·권장 액션)을 en/ko로 제공. 배지 텍스트(LIVE/REVIEW…)는 언어 무관 고정.
  - `storepulse`: 모든 명령에서 `--lang ko|en` 지원 — 우선순위 `--lang` > `STOREPULSE_LANG` > OS 로케일(LC_ALL/LC_MESSAGES/LANG) > en. 안내문·에러·도움말 번역, 보드 하단에 `storepulse explain` 힌트 추가.
  - `storepulse explain [state]` 신규 명령: 전체 범례(배지 색상 포함) 및 상태별 상세(의미·원본 상태·권장 액션). 배지 텍스트(`REVIEW` 등)로도 조회 가능.
  - 대시보드: 헤더 EN/KO 스위처(localStorage 유지, 브라우저 언어 기본값), 상태 배지 클릭 → 용어 설명 오버레이(행 상세 패널과 동선 분리, Esc/닫기·키보드 접근성). 사전은 빌드 시 번들에 포함(`scripts/gen-dashboard-i18n.mjs`) — 스냅샷(status.json)에는 넣지 않음.

## 0.3.0

### Minor Changes

- ec9cc55: 대시보드 상세 패널·필터 추가 및 릴리즈 상세 필드(releaseNotes/date/expiresAt) 도입

  - core: `ChannelStatus`에 선택 필드 `releaseNotes`(릴리즈 노트), `date`(ISO — iOS appStoreVersion createdDate / TestFlight uploadedDate), `expiresAt`(ISO — TestFlight expirationDate) 추가. 전부 optional이라 기존 소비자와 하위 호환이며 스냅샷 `schemaVersion`은 1을 유지합니다.
  - AscConnector: production 채널의 What's New(로케일 ko → en-US → 첫 번째)와 createdDate, TestFlight 빌드의 uploadedDate/expirationDate를 수집합니다.
  - GooglePlayConnector: 기존 tracks 응답의 `release.releaseNotes[]`에서 로케일 우선순위(ko-KR → en-US → 첫 번째)로 릴리즈 노트를 추출합니다(추가 API 호출 없음).
  - dashboard: 행 클릭(키보드 접근 가능한 ▸/▾ 버튼)으로 펼쳐지는 상세 패널 — 릴리즈 노트 전문(줄바꿈 보존), 로컬 시간 날짜, TestFlight 만료 D-day(7일 이하 경고색), 빌드/rawState/rolloutPercent. 상단에 OS(All/iOS/Android)·그룹 필터 칩 추가(AND 조합, 클라이언트 사이드).

## 0.2.0

### Minor Changes

- 59aecab: 웹 대시보드 도입 — 새 `storepulse snapshot` / `storepulse serve` 명령과 번들 정적 대시보드.

  - `storepulse snapshot [--demo] [--out <file>]`: 릴리즈 보드를 JSON 스냅샷(schemaVersion 1, `generatedAt` 포함)으로 출력합니다. 스키마 계약은 `docs/snapshot-schema.md` 참고.
  - `storepulse serve [--demo] [--port] [--host] [--refresh]`: Node 내장 http 모듈만으로 로컬 대시보드를 띄웁니다. 기본 바인딩은 127.0.0.1(루프백 전용), `GET /api/status`가 스냅샷 JSON을 반환하며 스토어 API 호출은 TTL 캐시(기본 60초)로 보호됩니다.
  - 대시보드는 의존성 없는 정적 SPA로 CLI 패키지에 번들되며, 유일한 데이터 소스는 `status.json`입니다(serve 모드에선 서버가, 정적 배포에선 파일이 제공 — 동일 빌드 산출물). 크리덴셜은 절대 브라우저로 가지 않습니다.
  - `@storepulse/core`: `Snapshot` 타입, `SNAPSHOT_SCHEMA_VERSION`, `createSnapshot()` 추가.

### Patch Changes

- 15405f4: 스토어 API 응답 파싱을 방어적으로 보강 — 필드가 누락되거나 모르는 상태 값이 와도 크래시 대신 해당 행이 "unknown"으로 표시됩니다. CLI 보드는 unknown 상태를 눈에 띄는 회색 UNKNOWN 배지(원본 rawState 병기)로 렌더합니다.
