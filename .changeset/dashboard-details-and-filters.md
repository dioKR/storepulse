---
"@storepulse/core": minor
"storepulse": minor
---

대시보드 상세 패널·필터 추가 및 릴리즈 상세 필드(releaseNotes/date/expiresAt) 도입

- core: `ChannelStatus`에 선택 필드 `releaseNotes`(릴리즈 노트), `date`(ISO — iOS appStoreVersion createdDate / TestFlight uploadedDate), `expiresAt`(ISO — TestFlight expirationDate) 추가. 전부 optional이라 기존 소비자와 하위 호환이며 스냅샷 `schemaVersion`은 1을 유지합니다.
- AscConnector: production 채널의 What's New(로케일 ko → en-US → 첫 번째)와 createdDate, TestFlight 빌드의 uploadedDate/expirationDate를 수집합니다.
- GooglePlayConnector: 기존 tracks 응답의 `release.releaseNotes[]`에서 로케일 우선순위(ko-KR → en-US → 첫 번째)로 릴리즈 노트를 추출합니다(추가 API 호출 없음).
- dashboard: 행 클릭(키보드 접근 가능한 ▸/▾ 버튼)으로 펼쳐지는 상세 패널 — 릴리즈 노트 전문(줄바꿈 보존), 로컬 시간 날짜, TestFlight 만료 D-day(7일 이하 경고색), 빌드/rawState/rolloutPercent. 상단에 OS(All/iOS/Android)·그룹 필터 칩 추가(AND 조합, 클라이언트 사이드).
