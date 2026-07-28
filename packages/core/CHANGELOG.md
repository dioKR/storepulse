# @storepulse/core

## 0.2.0

### Minor Changes

- 59aecab: 웹 대시보드 도입 — 새 `storepulse snapshot` / `storepulse serve` 명령과 번들 정적 대시보드.

  - `storepulse snapshot [--demo] [--out <file>]`: 릴리즈 보드를 JSON 스냅샷(schemaVersion 1, `generatedAt` 포함)으로 출력합니다. 스키마 계약은 `docs/snapshot-schema.md` 참고.
  - `storepulse serve [--demo] [--port] [--host] [--refresh]`: Node 내장 http 모듈만으로 로컬 대시보드를 띄웁니다. 기본 바인딩은 127.0.0.1(루프백 전용), `GET /api/status`가 스냅샷 JSON을 반환하며 스토어 API 호출은 TTL 캐시(기본 60초)로 보호됩니다.
  - 대시보드는 의존성 없는 정적 SPA로 CLI 패키지에 번들되며, 유일한 데이터 소스는 `status.json`입니다(serve 모드에선 서버가, 정적 배포에선 파일이 제공 — 동일 빌드 산출물). 크리덴셜은 절대 브라우저로 가지 않습니다.
  - `@storepulse/core`: `Snapshot` 타입, `SNAPSHOT_SCHEMA_VERSION`, `createSnapshot()` 추가.

### Patch Changes

- 15405f4: 스토어 API 응답 파싱을 방어적으로 보강 — 필드가 누락되거나 모르는 상태 값이 와도 크래시 대신 해당 행이 "unknown"으로 표시됩니다. CLI 보드는 unknown 상태를 눈에 띄는 회색 UNKNOWN 배지(원본 rawState 병기)로 렌더합니다.
