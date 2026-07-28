# storepulse

## 0.3.0

### Minor Changes

- ec9cc55: 대시보드 상세 패널·필터 추가 및 릴리즈 상세 필드(releaseNotes/date/expiresAt) 도입

  - core: `ChannelStatus`에 선택 필드 `releaseNotes`(릴리즈 노트), `date`(ISO — iOS appStoreVersion createdDate / TestFlight uploadedDate), `expiresAt`(ISO — TestFlight expirationDate) 추가. 전부 optional이라 기존 소비자와 하위 호환이며 스냅샷 `schemaVersion`은 1을 유지합니다.
  - AscConnector: production 채널의 What's New(로케일 ko → en-US → 첫 번째)와 createdDate, TestFlight 빌드의 uploadedDate/expirationDate를 수집합니다.
  - GooglePlayConnector: 기존 tracks 응답의 `release.releaseNotes[]`에서 로케일 우선순위(ko-KR → en-US → 첫 번째)로 릴리즈 노트를 추출합니다(추가 API 호출 없음).
  - dashboard: 행 클릭(키보드 접근 가능한 ▸/▾ 버튼)으로 펼쳐지는 상세 패널 — 릴리즈 노트 전문(줄바꿈 보존), 로컬 시간 날짜, TestFlight 만료 D-day(7일 이하 경고색), 빌드/rawState/rolloutPercent. 상단에 OS(All/iOS/Android)·그룹 필터 칩 추가(AND 조합, 클라이언트 사이드).

### Patch Changes

- Updated dependencies [ec9cc55]
  - @storepulse/core@0.3.0

## 0.2.0

### Minor Changes

- 59aecab: 웹 대시보드 도입 — 새 `storepulse snapshot` / `storepulse serve` 명령과 번들 정적 대시보드.

  - `storepulse snapshot [--demo] [--out <file>]`: 릴리즈 보드를 JSON 스냅샷(schemaVersion 1, `generatedAt` 포함)으로 출력합니다. 스키마 계약은 `docs/snapshot-schema.md` 참고.
  - `storepulse serve [--demo] [--port] [--host] [--refresh]`: Node 내장 http 모듈만으로 로컬 대시보드를 띄웁니다. 기본 바인딩은 127.0.0.1(루프백 전용), `GET /api/status`가 스냅샷 JSON을 반환하며 스토어 API 호출은 TTL 캐시(기본 60초)로 보호됩니다.
  - 대시보드는 의존성 없는 정적 SPA로 CLI 패키지에 번들되며, 유일한 데이터 소스는 `status.json`입니다(serve 모드에선 서버가, 정적 배포에선 파일이 제공 — 동일 빌드 산출물). 크리덴셜은 절대 브라우저로 가지 않습니다.
  - `@storepulse/core`: `Snapshot` 타입, `SNAPSHOT_SCHEMA_VERSION`, `createSnapshot()` 추가.

### Patch Changes

- 15405f4: 스토어 API 응답 파싱을 방어적으로 보강 — 필드가 누락되거나 모르는 상태 값이 와도 크래시 대신 해당 행이 "unknown"으로 표시됩니다. CLI 보드는 unknown 상태를 눈에 띄는 회색 UNKNOWN 배지(원본 rawState 병기)로 렌더합니다.
- Updated dependencies [59aecab]
- Updated dependencies [15405f4]
  - @storepulse/core@0.2.0
