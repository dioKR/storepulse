---
"@storepulse/core": patch
"storepulse": patch
---

Google Play의 배포 트랙 설정과 심사 생명주기를 버전 코드 기준으로 함께 조회합니다.

- 심사 중인 Android 릴리즈를 staged rollout 퍼센트가 아닌 `in-review`로 표시합니다.
- 승인 후 미출시·거절·미제출 상태를 각각 `pending`·`rejected`·`draft`로 정규화합니다.
- 실제 게시가 확인된 릴리즈에만 기존 rollout 퍼센트를 표시합니다.
