<!-- logo: docs/images/logo.png (준비 중) -->

# storepulse

[English](README.md) | **한국어** | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

**모든 iOS · Android 앱의 릴리즈 현황을 한눈에.**

🌐 **웹사이트 & 튜토리얼 → [diokr.github.io/storepulse](https://diokr.github.io/storepulse/ko/)**

지금 나가 있는 버전이 뭐죠? 어떤 버전이 심사에 걸려 있죠? TestFlight엔 지금 뭐가
올라가 있고요? 이걸 확인하려고 App Store Connect랑 Google Play Console을 앱마다
번갈아 열고 있다면, storepulse가 그 수고를 덜어드려요. 명령어 하나, 보드 하나면
끝나요:

![storepulse 데모 — pnpm demo가 릴리즈 보드를 그리는 애니메이션](docs/images/demo.svg)

**Expo / React Native** 팀을 먼저 생각하며 만들었지만, iOS·Android 앱이라면
어떤 것이든 잘 맞아요 — storepulse는 빌드 시스템이 아니라 스토어하고만
이야기하거든요.

- 🔍 **읽기 전용이에요.** 두 스토어의 무엇도 바꾸지 않아요.
- 🔐 **크리덴셜은 내 컴퓨터 밖으로 나가지 않아요.** storepulse는 Apple과
  Google을 직접 호출해요 — 서버도, 가입도, 사용 정보 수집도 없어요.
- 🧩 **확장하기 좋아요.** 코어는 라이브러리이고, CLI는 그걸 처음 가져다 쓴
  화면일 뿐이에요.

---

## 일단 체험부터 — 크리덴셜 없이

샘플 데이터만으로 storepulse가 뭘 하는지 1분 안에 볼 수 있어요.

**준비물**: [Node.js](https://nodejs.org) 20.12 이상,
[pnpm](https://pnpm.io) 9 이상이에요.

```sh
git clone https://github.com/dioKR/storepulse.git
cd storepulse
pnpm install
pnpm demo
```

이게 다예요 — 지금 보이는 보드는 실제 팀 상황을 본뜬 가짜 데이터예요.
앱 두 개, 각각 prod·dev 변형, 양쪽 플랫폼이요.

## 보드 읽는 법

각 행은 "앱 하나의 플랫폼 하나"예요. 각 열은 **채널** — 버전이 사용자에게
가닿기까지 거쳐 가는 자리고요:

| 열 | iOS | Android |
|---|---|---|
| `PRODUCTION` | App Store | production 트랙 |
| `BETA / TESTFLIGHT` | TestFlight (외부) | 공개/비공개 테스트 |
| `INTERNAL` | TestFlight (내부) | 내부 테스트 |

셀 안의 버전마다 **상태** 배지가 붙어요:

| 배지 | 뜻 |
|---|---|
| `2.4.1 LIVE` (초록) | 완전히 출시돼 사용자에게 제공 중이에요 |
| `2.4.1 50%` (청록) | 단계적으로 출시 중 — 사용자의 50%가 받았어요 |
| `2.5.0 REVIEW` (노랑) | 스토어 심사를 기다리거나 진행 중이에요 |
| `2.5.0 PENDING` (파랑) | 승인됐거나 처리 중인데, 아직 출시 전이에요 |
| `1.9.3 REJECTED` (빨강) | 심사에서 거절됐어요 — 확인이 필요해요 |
| `2.5.1 draft` (흐림) | 준비는 됐지만 아직 제출 전이에요 |
| `(108)` (흐림) | 빌드 번호 / versionCode |

한 셀에 버전이 여러 개 보이기도 해요 — `2.4.1 LIVE · 2.5.0 REVIEW`는
"사용자는 2.4.1을 쓰고 있고, 2.5.0은 심사를 기다리는 중"이라는 뜻이에요.
바로 이 '사이의 순간'을 눈에 보이게 하려고 만든 도구예요.

## 같은 보드를 브라우저로, JSON으로

CLI 보드에는 형제 명령이 둘 있어요. 둘 다 데모 모드로, 크리덴셜 없이 써볼 수
있어요:

```sh
npx storepulse serve --demo     # 로컬 웹 대시보드 → http://127.0.0.1:4780
npx storepulse snapshot --demo  # 보드를 JSON으로 출력
```

![데모 보드를 그린 storepulse 웹 대시보드](docs/images/dashboard-demo.png)

- **`storepulse serve`**는 같은 보드를 같은 디자인으로 보여주는 로컬 웹
  대시보드를 띄워요. 자동으로 새로고침되고요. 옵션은 `--port`, `--host`,
  `--refresh <초>`예요. 기본으로 `127.0.0.1`에만 바인딩돼요 — 보드에 미출시
  버전 번호가 보일 수 있으니, 밖으로 여는 건 신중하게요.
- **`storepulse snapshot`**은 보드를 JSON으로 출력해요 (`--out <파일>`을 주면
  파일로 저장돼요) — CI 아티팩트나 자체 스크립트에 쓰기 좋아요. 문서 형식은
  [docs/snapshot-schema.md](docs/snapshot-schema.md)에 정리돼 있어요.

`--demo`를 빼면 두 명령 모두 아래에서 설정하는 실제 구성을 사용해요.

---

## 실제 앱 연결하기

세 단계면 돼요: 앱 목록 작성 → 크리덴셜 입력 → 실행.

### 1단계 — 앱 목록 작성

예제 설정을 복사해서 고쳐요:

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
| `key` | 겹치지만 않으면 아무 이름이나 (내부에서만 써요) |
| `name` | 보드에 표시되는 이름 |
| `group` | 이름 옆에 붙는 라벨 (선택) — 예: `prod` / `dev` |
| `platform` | `ios` 또는 `android` |
| `storeId` | **iOS**: 앱의 숫자 Apple ID · **Android**: 패키지명 |

**iOS 숫자 ID는 어디서 찾나요?** App Store Connect → 해당 앱 →
**앱 정보(App Information)** → 일반 정보 → **Apple ID** (`1234567890` 같은 숫자예요):

![Apple ID 찾는 위치](docs/images/asc-app-id.png)

### 2단계 — 크리덴셜 입력

```sh
cp .env.example .env
```

이제 `.env`를 채워요. Apple에서 하나, Google에서 하나 — 각각 5분쯤 걸리는
1회성 설정이에요.

#### Apple — App Store Connect API 키

1. [App Store Connect](https://appstoreconnect.apple.com) →
   **사용자 및 액세스(Users and Access)** → **통합(Integrations)** →
   **App Store Connect API**로 들어가요.
2. **팀 키(Team Keys)**에서 **＋**를 눌러 키를 만들어요.
   역할은 **Developer**를 권장해요 — storepulse가 읽는 데는 이걸로
   충분하거든요. **App Manager**로도 동작하지만, 키가 유출되면 앱 제출과
   메타데이터 수정 권한까지 넘어가니 최소 권한으로 만드는 게 안전해요.
3. **`.p8` 파일을 내려받아요** — Apple은 딱 한 번만 받게 해줘요.
   안전한 곳에 보관하세요 (여기서는 기본으로 git에서 제외돼요). 이 키는
   역할이 허용하는 만큼 쓰기도 가능한 크리덴셜이라, 유출됐다면 App Store
   Connect에서 즉시 폐기(revoke)하세요.
4. 세 가지 값을 `.env`에 옮겨요:

```ini
ASC_KEY_ID=ABC123DEFG          # 만든 키의 "Key ID" 열
ASC_ISSUER_ID=xxxxxxxx-...     # 페이지 상단의 "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

![App Store Connect API 키 생성 화면](docs/images/asc-key.png)

#### Google — Play 서비스 계정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트를
   고르거나 새로 만들고 **Google Play Android Developer API**를 켜요.
2. **IAM 및 관리자 → 서비스 계정** → 하나 만들고 (특별한 역할은 없어도 돼요) →
   **키** 탭 → **키 추가 → JSON**. JSON 파일이 내려받아져요.
3. [Play Console](https://play.google.com/console) →
   **사용자 및 권한** → **새 사용자 초대** → 서비스 계정 이메일
   (`...@...iam.gserviceaccount.com`)을 붙여넣고 → 앱에
   **앱 정보 보기(View app information)** 권한을 줘요. 권한은 딱 이것만
   주세요 — **출시(Release) 관련 권한은 절대 주면 안 돼요.** storepulse에는
   필요 없고, 이렇게 해야 키가 유출돼도 읽기 전용에 머물러요.
4. `.env`가 그 JSON을 가리키게 해요:

```ini
PLAY_SERVICE_ACCOUNT_PATH=./service-account.json
```

![Play Console 서비스 계정 초대 화면](docs/images/play-invite.png)

> **CI 팁**: 두 시크릿 모두 `*_BASE64` 변형(`ASC_PRIVATE_KEY_BASE64`,
> `PLAY_SERVICE_ACCOUNT_BASE64`)을 지원해서, 파일 없이 CI 시크릿으로 넣을 수
> 있어요.

### 3단계 — 실행

```sh
pnpm status
```

여러분의 실제 보드가 나타나요. 크리덴셜에 문제가 있는 행은 보드 전체를 가리는
대신 그 자리에만 에러를 보여줘요.

---

## 문제 해결

| 증상 | 이럴 가능성이 높아요 |
|---|---|
| `ASC API 401` | Key ID / Issuer ID가 틀렸거나, `.p8`이 그 Key ID의 것이 아니에요 |
| `ASC API 404` | `storeId`가 *숫자* Apple ID가 아니거나, 키 역할로는 그 앱이 안 보여요 |
| `Play API 403` | Play Console에 서비스 계정이 초대되지 않았거나, Cloud 프로젝트에서 Android Developer API가 꺼져 있어요 |
| `Play API 404` | 패키지명 오타이거나, 한 번도 릴리즈된 적 없는 앱이에요 |
| Android에 심사 상태가 안 보여요 | 버그 아니에요 — Google API가 심사 상태를 알려주지 않아요 ([자세히](wiki/Architecture.md)) |

## 아키텍처

`@storepulse/core`가 두 스토어를 하나의 모델(채널 × 상태)로 정규화하고,
메서드 2개짜리 `StoreConnector` 인터페이스 뒤에 감춰요. CLI는 그걸 처음
가져다 쓴 화면일 뿐이고요. 다이어그램까지 포함한 전체 그림은
[**wiki/Architecture**](wiki/Architecture.md)에서 볼 수 있어요.

## 개발

```sh
pnpm demo        # 샘플 데이터로 보드 표시
pnpm status      # 실제 설정으로 보드 표시
pnpm typecheck   # 전체 패키지 tsc
pnpm test        # 유닛 테스트 (vitest)
pnpm lint        # Biome (린트 + 포맷 검사)
pnpm lint:fix    # 자동 수정
```

포맷팅과 린팅은 [Biome](https://biomejs.dev) 하나로 처리해요 — ESLint +
Prettier를 대신하는 단일 도구예요. 에디터는 Biome 확장만 설치하면
`biome.json`을 알아서 인식해요.

## 로드맵

- [ ] EAS 커넥터 — 스토어 상태를 Expo 빌드·제출과 연결
- [ ] 상태가 바뀌면 Slack/Discord 알림 ("2.5.0 심사 통과 🎉")
- [x] 웹 대시보드 (`storepulse serve`)
- [x] npm 배포 (`npx storepulse`)
- [ ] CLI 출력 영어·한국어 지원

## 라이선스

[MIT](LICENSE)
