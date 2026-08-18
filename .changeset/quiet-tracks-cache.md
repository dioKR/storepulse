---
"@storepulse/core": patch
"storepulse": patch
---

Google Play release lifecycle 조회가 listing quota를 반복 소진하지 않도록 보강합니다.

- versionCode가 없는 빈 트랙은 건너뛰고, 트랙별 lifecycle 결과를 1시간 동안 캐시합니다.
- 쿼터 초과 시 트랙별 재시도를 1시간 멈추며, 마지막 정상 lifecycle이 있으면 stale 상태로 유지합니다.
- `serve`가 같은 커넥터 인스턴스를 재사용해 대시보드 새로고침 사이에도 캐시와 backoff가 보존됩니다.
- 캐시가 없는 쿼터 오류는 잘못된 rollout 대신 `unknown`과 `lifecycle=(quota-exceeded)`로 드러냅니다.
