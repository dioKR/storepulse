---
"storepulse": minor
"@storepulse/core": minor
---

`storepulse doctor` 신규 명령 — 크리덴셜·권한 사전 진단 (#6)

- 온보딩에서 가장 자주 막히는 401/403 원인을 순차 진단 체크리스트(✓/✗/–)로 자동 판별합니다: [1] 설정 파일 → [2] .env 시크릿 → [3] App Store Connect 체인 → [4] Google Play 체인 → [5] 요약(실패 항목마다 한 줄 해결책 + 언어별 튜토리얼 링크). 실패가 하나라도 있으면 exit 1이며, ios/android 타깃이 없는 축은 스킵으로 표시합니다.
- Apple 체인은 .p8 파싱·JWT 서명 실패(키 파일 문제), 401(Key ID·Issuer ID 불일치 또는 키 폐기), 특정 앱 404(storeId 오류 또는 키 롤의 앱 접근 불가)를 구분합니다. Google 체인은 invalid_grant(키 삭제·시계 오차), "API disabled/has not been used" 403(Cloud 프로젝트 API 비활성), 그 외 403(Play Console 초대 누락·권한 부족), 404(패키지명 오류·릴리즈 이력 없음)를 응답 본문으로 구분하며, 검사용 edit은 생성 즉시 삭제합니다.
- `storepulse init` 템플릿의 플레이스홀더 값을 그대로 둔 경우와 키 파일 경로가 존재하지 않는 경우도 짚어 줍니다. 모든 출력은 공유 i18n 사전(en/ko)을 사용하고 전역 `--lang ko|en` 플래그를 지원합니다.
- @storepulse/core: JWT·토큰 로직 재사용을 위해 `createAscToken(creds)`, `createPlayAccessToken(creds, fetchImpl?)`, `PlayTokenExchangeError`를 공개 API로 export합니다 (커넥터 내부도 동일 헬퍼를 사용하도록 정리 — 중복 구현 없음).
