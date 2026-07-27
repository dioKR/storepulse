# 📸 스크린샷 촬영 목록

README가 참조하는 이미지들입니다. 아래 파일명 **그대로** 이 폴더
(`docs/images/`)에 저장하면 README에 자동으로 나타납니다.

> ⚠️ 공통 주의: 실제 앱 이름·매출·이메일 등 민감한 정보가 화면에 있으면
> 가리고 찍으세요 (macOS 캡처 후 미리보기에서 블러/사각형).

## ~~1. `demo.png`~~ — 불필요해짐 ✅

README 히어로는 이제 애니메이션 SVG(`demo.svg`)가 대신합니다.
수정하려면 `scripts/gen-demo-svg.mjs`를 고치고 `node scripts/gen-demo-svg.mjs`로 재생성하세요.

## 2. `asc-app-id.png` — Apple ID 위치

- App Store Connect → 아무 앱 → **App Information** → General Information
- **Apple ID** 숫자가 보이는 부분 위주로 캡처 (전체 페이지 불필요)

## 3. `asc-key.png` — ASC API 키 페이지

- App Store Connect → Users and Access → **Integrations** →
  App Store Connect API → Team Keys
- **Issuer ID**와 키 목록의 **Key ID** 열이 보이게 캡처
- Key ID 값 자체는 가려도 됩니다 (위치만 보이면 충분)

## 4. `play-invite.png` — Play Console 서비스 계정 초대

- Play Console → **Users and permissions**
- 서비스 계정 이메일(`...iam.gserviceaccount.com`)이 목록에 있는 화면
- 또는 "Invite new users" 다이얼로그에서 권한 선택 화면

## (나중에) `logo.png` — 로고

- 로고가 만들어지면 여기에 추가하고 README 상단 주석을 해제하세요
