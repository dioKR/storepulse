---
"@storepulse/core": patch
"storepulse": patch
---

스토어 API 응답 파싱을 방어적으로 보강 — 필드가 누락되거나 모르는 상태 값이 와도 크래시 대신 해당 행이 "unknown"으로 표시됩니다. CLI 보드는 unknown 상태를 눈에 띄는 회색 UNKNOWN 배지(원본 rawState 병기)로 렌더합니다.
