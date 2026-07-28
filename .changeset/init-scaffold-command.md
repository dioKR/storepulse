---
"storepulse": minor
---

`storepulse init` 신규 명령 — 설정 템플릿 스캐폴딩 (#9)

- 현재 폴더에 `storepulse.config.json` / `.env` 템플릿을 생성합니다. npm(npx) 설치본에는 레포의 example 파일이 없으므로 템플릿을 CLI에 내장했으며(레포 example 파일과 동기화되는 sync 테스트 포함), `.env` 템플릿은 최소 권한 롤 권고 보안 문구를 그대로 유지합니다.
- 이미 존재하는 파일은 절대 덮어쓰지 않고 경고 후 해당 파일만 건너뜁니다.
- `.gitignore`가 있으면 `.env` / `*.p8` / `service-account*.json` / `storepulse.config.json` 중 누락 항목만 자동으로 append하고, 없으면 새로 생성합니다 — 크리덴셜 커밋 사고 방지가 목적이며 무엇을 했는지 출력으로 알립니다.
- 완료 후 다음 단계(① config에 앱 정보 입력 — storeId 힌트 포함 ② 키 발급 튜토리얼 링크 ③ `npx storepulse`)를 번호 목록으로 안내합니다. 모든 출력은 공유 i18n 사전(en/ko)을 사용하며 `--lang ko|en` 전역 플래그를 지원합니다.
