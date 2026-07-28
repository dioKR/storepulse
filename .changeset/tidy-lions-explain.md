---
"storepulse": minor
"@storepulse/core": minor
---

i18n 에픽: 공유 번역 사전 + CLI 한국어 + `storepulse explain` + 대시보드 언어 스위처·배지 설명

- `@storepulse/core`: 공유 i18n 사전 추가 (`SUPPORTED_LANGS`, `normalizeLang`, `UI_STRINGS`, `STATE_EXPLANATIONS`, `uiString`) — ReleaseState별 설명(의미·스토어 원본 상태·권장 액션)을 en/ko로 제공. 배지 텍스트(LIVE/REVIEW…)는 언어 무관 고정.
- `storepulse`: 모든 명령에서 `--lang ko|en` 지원 — 우선순위 `--lang` > `STOREPULSE_LANG` > OS 로케일(LC_ALL/LC_MESSAGES/LANG) > en. 안내문·에러·도움말 번역, 보드 하단에 `storepulse explain` 힌트 추가.
- `storepulse explain [state]` 신규 명령: 전체 범례(배지 색상 포함) 및 상태별 상세(의미·원본 상태·권장 액션). 배지 텍스트(`REVIEW` 등)로도 조회 가능.
- 대시보드: 헤더 EN/KO 스위처(localStorage 유지, 브라우저 언어 기본값), 상태 배지 클릭 → 용어 설명 오버레이(행 상세 패널과 동선 분리, Esc/닫기·키보드 접근성). 사전은 빌드 시 번들에 포함(`scripts/gen-dashboard-i18n.mjs`) — 스냅샷(status.json)에는 넣지 않음.
