<!-- logo: docs/images/logo.png (준비 중) -->

# storepulse

[English](README.md) | **한국어**

**모든 iOS · Android 앱의 릴리즈 현황을 한눈에.**

지금 출시된 버전이 뭐지? 어떤 버전이 심사에 걸려 있지? TestFlight에는 뭐가
올라가 있지? — 이걸 확인하려고 App Store Connect와 Google Play Console을 앱마다
들락거리고 있다면, storepulse가 그 일을 없애줍니다. 명령어 하나, 보드 하나:

![storepulse 데모 보드](docs/images/demo.png)

**Expo / React Native** 팀을 우선 염두에 두고 만들었지만, 어떤 iOS/Android
앱이든 사용할 수 있습니다 — storepulse는 빌드 시스템이 아니라 스토어하고만
통신하니까요.

- 🔍 **읽기 전용.** 두 스토어의 어떤 것도 변경하지 않습니다.
- 🔐 **크리덴셜은 내 컴퓨터 밖으로 나가지 않습니다.** storepulse는 Apple과
  Google을 직접 호출합니다 — 서버도, 가입도, 데이터 수집도 없습니다.
- 🧩 **확장 가능.** 코어는 라이브러리이고, CLI는 그 첫 번째 소비자일 뿐입니다.

---

## 먼저 체험해보기 — 크리덴셜 필요 없음

샘플 데이터로 storepulse가 뭘 하는지 1분 안에 볼 수 있습니다.

**준비물**: [Node.js](https://nodejs.org) 20.12 이상,
[pnpm](https://pnpm.io) 9 이상.

```sh
git clone https://github.com/dioKR/storepulse.git
cd storepulse
pnpm install
pnpm demo
```

끝입니다 — 지금 보이는 보드는 실제 팀 상황을 본뜬 가짜 데이터입니다:
앱 2개, 각각 prod/dev 변형, 양 플랫폼.

## 보드 읽는 법

각 행은 "한 앱의 한 플랫폼"입니다. 각 열은 **채널** — 버전이 사용자에게
도달하기까지 머무는 위치입니다:

| 열 | iOS | Android |
|---|---|---|
| `PRODUCTION` | App Store | production 트랙 |
| `BETA / TESTFLIGHT` | TestFlight (외부) | 공개/비공개 테스트 |
| `INTERNAL` | TestFlight (내부) | 내부 테스트 |

셀 안의 각 버전에는 **상태** 배지가 붙습니다:

| 배지 | 의미 |
|---|---|
| `2.4.1 LIVE` (초록) | 완전히 출시되어 사용자에게 제공 중 |
| `2.4.1 50%` (청록) | 단계적 출시 진행 중 — 사용자의 50%에게 배포됨 |
| `2.5.0 REVIEW` (노랑) | 스토어 심사 대기 / 진행 중 |
| `2.5.0 PENDING` (파랑) | 승인됐거나 처리 중, 아직 미출시 |
| `1.9.3 REJECTED` (빨강) | 심사 거절 — 확인 필요 |
| `2.5.1 draft` (흐림) | 준비됐지만 제출 전 |
| `(108)` (흐림) | 빌드 번호 / versionCode |

한 셀에 버전이 여러 개 보일 수 있습니다 — `2.4.1 LIVE · 2.5.0 REVIEW`는
"사용자는 2.4.1을 쓰고 있고, 2.5.0이 심사 대기 중"이라는 뜻입니다. 바로 이
'사이의 순간'을 보이게 만드는 게 이 도구의 존재 이유입니다.

---

## 실제 앱 연결하기

세 단계입니다: 앱 목록 작성 → 크리덴셜 입력 → 실행.

### 1단계 — 앱 목록 작성

예제 설정을 복사해서 수정하세요:

```sh
cp storepulse.config.example.json storepulse.config.json
```

```jsonc
{
  "apps": [
    { "key": "myapp-ios",     "name": "MyApp", "group": "prod",
      "platform": "ios",     "storeId": "1234567890" },
    { "key": "myapp-android", "name": "MyApp", "group": "prod",
      "platform": "android", "storeId": "com.example.myapp" }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `key` | 내부 식별용 — 겹치지만 않으면 아무 이름이나 |
| `name` | 보드에 표시될 이름 |
| `group` | 이름 옆에 표시되는 라벨 (선택) — 예: `prod` / `dev` |
| `platform` | `ios` 또는 `android` |
| `storeId` | **iOS**: 앱의 숫자 Apple ID. **Android**: 패키지명 |

**iOS 숫자 ID는 어디서 찾나요?** App Store Connect → 해당 앱 →
**앱 정보(App Information)** → 일반 정보 → **Apple ID** (`1234567890` 같은 숫자):

![Apple ID 찾는 위치](docs/images/asc-app-id.png)

### 2단계 — 크리덴셜 입력

```sh
cp .env.example .env
```

이제 `.env`를 채웁니다. Apple에서 하나, Google에서 하나 — 각각 5분쯤 걸리는
1회성 설정입니다.

#### Apple — App Store Connect API 키

1. [App Store Connect](https://appstoreconnect.apple.com) →
   **사용자 및 액세스(Users and Access)** → **통합(Integrations)** →
   **App Store Connect API**로 이동합니다.
2. **팀 키(Team Keys)**에서 **＋**를 눌러 키를 생성합니다.
   역할은 **App Manager**면 충분합니다 (storepulse는 읽기만 하니까요).
3. **`.p8` 파일을 다운로드합니다** — Apple은 딱 한 번만 다운로드를 허용합니다.
   안전한 곳에 보관하세요 (이 저장소에서는 기본으로 git-ignore 됩니다).
4. 세 가지 값을 `.env`에 복사합니다:

```ini
ASC_KEY_ID=ABC123DEFG          # 생성한 키의 "Key ID" 열
ASC_ISSUER_ID=xxxxxxxx-...     # 페이지 상단의 "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

![App Store Connect API 키 생성 화면](docs/images/asc-key.png)

#### Google — Play 서비스 계정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트를
   선택(또는 생성)하고 **Google Play Android Developer API**를 활성화합니다.
2. **IAM 및 관리자 → 서비스 계정** → 계정 생성 (특별한 역할 불필요) →
   **키** 탭 → **키 추가 → JSON**. JSON 파일이 다운로드됩니다.
3. [Play Console](https://play.google.com/console) →
   **사용자 및 권한** → **새 사용자 초대** → 서비스 계정 이메일
   (`...@...iam.gserviceaccount.com`)을 붙여넣고 → 앱 접근 권한으로
   **앱 정보 보기(View app information)**를 부여합니다.
4. `.env`에 JSON 경로를 지정합니다:

```ini
PLAY_SERVICE_ACCOUNT_PATH=./service-account.json
```

![Play Console 서비스 계정 초대 화면](docs/images/play-invite.png)

> **CI 팁**: 두 시크릿 모두 `*_BASE64` 변형(`ASC_PRIVATE_KEY_BASE64`,
> `PLAY_SERVICE_ACCOUNT_BASE64`)을 지원해서, 파일 없이 CI 시크릿으로 넣을 수
> 있습니다.

### 3단계 — 실행

```sh
pnpm status
```

실제 보드가 나타납니다. 크리덴셜에 문제가 있는 행은 보드 전체를 가리는 대신
해당 행에만 에러를 표시합니다.

---

## 문제 해결

| 증상 | 원인일 가능성이 높은 것 |
|---|---|
| `ASC API 401` | Key ID / Issuer ID가 틀렸거나, `.p8`이 해당 Key ID의 것이 아님 |
| `ASC API 404` | `storeId`가 *숫자* Apple ID가 아니거나, 키 역할이 그 앱을 볼 수 없음 |
| `Play API 403` | Play Console에 서비스 계정이 초대되지 않았거나, Cloud 프로젝트에서 Android Developer API가 비활성 |
| `Play API 404` | 패키지명 오타, 또는 릴리즈가 한 번도 없었던 앱 |
| Android에 심사 상태가 안 보임 | 버그 아님 — Google API가 심사 상태를 제공하지 않습니다 ([자세히](wiki/Architecture.md)) |

## 아키텍처

`@storepulse/core`가 두 스토어를 하나의 모델(채널 × 상태)로 정규화하고, 메서드
2개짜리 `StoreConnector` 인터페이스 뒤에 숨깁니다. CLI는 그 첫 번째 소비자일
뿐입니다. 다이어그램을 포함한 전체 그림은
[**wiki/Architecture**](wiki/Architecture.md)에서 보세요.

## 개발

```sh
pnpm demo        # 샘플 데이터로 보드 표시
pnpm status      # 실제 설정으로 보드 표시
pnpm typecheck   # 전체 패키지 tsc
pnpm lint        # Biome (린트 + 포맷 검사)
pnpm lint:fix    # 자동 수정
```

포맷팅과 린팅은 [Biome](https://biomejs.dev) 하나로 처리합니다 — ESLint +
Prettier를 대체하는 단일 도구입니다. 에디터 설정: Biome 확장을 설치하면
`biome.json`을 자동으로 인식합니다.

## 로드맵

- [ ] EAS 커넥터 — 스토어 상태를 Expo 빌드·제출과 연결
- [ ] 상태 변화 시 Slack/Discord 알림 ("2.5.0 심사 통과 🎉")
- [ ] 웹 대시보드
- [ ] npm 배포 (`npx storepulse`)
- [ ] CLI 출력 영어·한국어 지원

## 라이선스

[MIT](LICENSE)
