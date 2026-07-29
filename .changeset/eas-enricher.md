---
"storepulse": minor
"@storepulse/core": minor
---

Expo(EAS) 연동: "심사 중인 그 버전, 어느 커밋·프로필·빌드인가?"를 보드에서 바로 답합니다.

- core: 커넥터와 별개의 **Enricher 단계** 도입 (`enrichAll`) — fetchAll 결과를 받아 보강하며, 실패한 enricher는 통째로 건너뜁니다(보드는 절대 죽지 않음).
- core: `EasEnricher` 추가 — EAS GraphQL API에서 최근 완료 빌드·제출 상태를 조회해 채널 항목의 version/build를 EAS 빌드의 appVersion/appBuildVersion과 매칭, `eas` 필드(profile·commit·buildId·completedAt·submissionStatus)를 덧붙입니다. 프로젝트×플랫폼 단위 실패는 조용히 생략.
- 스냅샷: `AppTarget.easProjectId`, `ChannelStatus.eas` **선택 필드** 추가 — 선택 필드 추가 규칙에 따라 schemaVersion은 1 유지 (docs/snapshot-schema.md 문서화).
- CLI: `.env`의 `EAS_TOKEN`(선택)과 config의 `easProjectId`가 모두 있으면 board/snapshot/serve 공통 경로에서 자동 보강. `storepulse doctor`에 [5] Expo (EAS) 체인 추가(토큰 → CurrentUser → projectId별 접근, 미사용 시 스킵). init 템플릿·.env.example에 EAS_TOKEN 안내(조직은 View Only 로봇 토큰 권장) 추가.
- 대시보드: 상세 패널에 EAS 블록(프로필 · 커밋 해시 축약 · 빌드 완료 시각 · 제출 상태) — `eas` 필드가 있을 때만 표시, en/ko 라벨.
