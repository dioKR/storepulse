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

배지 뜻이 가물가물하다면, 범례가 CLI에 내장돼 있어요:

```sh
npx storepulse explain            # 전체 상태를 한눈에
npx storepulse explain rejected   # 상태 하나를 깊게 — 의미, 스토어 원본 상태, 권장 액션
```

CLI의 안내문·에러·도움말은 영어와 한국어를 지원해요 — `--lang ko|en`이나
`STOREPULSE_LANG`으로 고르고, 지정이 없으면 OS 로케일을 따라가요 (배지와
컬럼 헤더는 어느 쪽이든 영어로 고정이에요).

## 같은 보드를 브라우저로, JSON으로

CLI 보드에는 형제 명령이 둘 있어요. 둘 다 데모 모드로, 크리덴셜 없이 써볼 수
있어요:

```sh
npx storepulse serve --demo     # 로컬 웹 대시보드 → http://127.0.0.1:4780
npx storepulse snapshot --demo  # 보드를 JSON으로 출력
```

![행마다 Latest 요약, 채널마다 ✓/▲ 전파 마크가 붙은 전폭 storepulse 웹 대시보드](docs/images/dashboard-propagation.png)

- **`storepulse serve`**는 같은 보드를 같은 디자인으로 보여주는 로컬 웹
  대시보드를 띄워요. 자동으로 새로고침되고요. 행을 클릭하면 상세 패널이
  열려요 — 릴리즈 노트 전문, 제출/업로드 날짜, 그리고 TestFlight 만료가
  7일 이하로 남으면 D-day 경고까지 보여줘요. 상단 칩으로 OS(iOS/Android)와
  그룹(`prod`/`dev`)을 조합해 보드를 좁혀볼 수도 있고요. 행마다 최신 번들
  요약(`Latest: 2.5.0 (108)`)이 붙고, 각 채널 앞에는 전파 마크가 표시돼요 —
  최신 번들이 이미 반영됐으면 ✓, 뒤처져 있으면 ▲(마우스를 올리면 현재 vs
  최신을 비교해줘요. Android는 versionCode 기준이에요). "최신 빌드가 어느
  환경까지 나갔나"가 한눈에 들어와요. 헤더의 EN/KO
  스위처로 대시보드 언어를 바꿀 수 있고(선택은 브라우저가 기억해요), 행이
  아니라 상태 배지를 클릭하면 그 상태가 무슨 뜻인지 알려주는 용어 설명
  다이얼로그가 열려요. 옵션은 `--port`,
  `--host`, `--refresh <초>`예요. 기본으로 `127.0.0.1`에만 바인딩돼요 —
  보드에 미출시 버전 번호가 보일 수 있으니, 밖으로 여는 건 신중하게요.
- **`storepulse snapshot`**은 보드를 JSON으로 출력해요 (`--out <파일>`을 주면
  파일로 저장돼요) — CI 아티팩트나 자체 스크립트에 쓰기 좋아요. 문서 형식은
  [docs/snapshot-schema.md](docs/snapshot-schema.md)에 정리돼 있어요.

![한국어로 표시된 대시보드 — 헤더에 EN/KO 스위처가 있어요](docs/images/dashboard-i18n.png)

![상태 배지를 클릭하면 열리는 용어 설명 다이얼로그 — `storepulse explain`이 출력하는 것과 같은 설명이에요](docs/images/dashboard-explain.png)

`--demo`를 빼면 두 명령 모두 아래에서 설정하는 실제 구성을 사용해요.

팀 전체가 온라인으로 보게 하고 싶나요? **[배포 가이드](docs/deploy/README.md)**가 AWS, Cloudflare, Vercel, Netlify, Google Cloud를 다뤄요 — 스냅샷 주기 갱신과 접근 제어까지 포함해서요.

---

## 실제 앱 연결하기

세 단계면 돼요: 앱 목록 작성 → 크리덴셜 입력 → 실행.

### 1단계 — 앱 목록 작성

먼저 설정 파일부터 만들어요 — 레포를 클론할 필요 없이, 아무 폴더에서나 돼요:

```sh
npx storepulse init
```

이 명령은 `storepulse.config.json`과 `.env` 템플릿을 만들고 (이미 있는 파일은
절대 덮어쓰지 않아요), 크리덴셜 파일이 커밋되지 않도록 `.gitignore`에 제외
패턴을 넣은 다음, 다음 단계를 터미널에 안내해줘요 (`--lang ko|en`).
(이 레포를 클론해서 쓰고 있다면 `cp storepulse.config.example.json
storepulse.config.json`으로도 같은 파일을 얻을 수 있어요.)

이제 `storepulse.config.json`을 열어 앱을 적어요:

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
**앱 정보(App Information)** → 일반 정보 → **Apple ID** (`1234567890` 같은 숫자예요).

### 2단계 — 크리덴셜 입력

이제 `storepulse init`이 만들어 준 `.env`를 채워요 (레포 클론이라면
`cp .env.example .env`). Apple에서 하나, Google에서 하나 — 각각 5분쯤 걸리는
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
   안전한 곳에 보관하세요 (`storepulse init`이 이미 git에서 제외해 뒀어요). 이 키는
   역할이 허용하는 만큼 쓰기도 가능한 크리덴셜이라, 유출됐다면 App Store
   Connect에서 즉시 폐기(revoke)하세요.
4. 세 가지 값을 `.env`에 옮겨요:

```ini
ASC_KEY_ID=ABC123DEFG          # 만든 키의 "Key ID" 열
ASC_ISSUER_ID=xxxxxxxx-...     # 페이지 상단의 "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

콘솔 화면은 종종 바뀌어요 — 메뉴 위치가 다르면 Apple 공식 가이드
[Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)를 따라가면 돼요.

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

콘솔 화면 구성이 달라졌다면 Google 공식
[Google Play Developer API 시작 가이드](https://developers.google.com/android-publisher/getting_started)에서 같은 단계를 확인할 수 있어요.

> **CI 팁**: 두 시크릿 모두 `*_BASE64` 변형(`ASC_PRIVATE_KEY_BASE64`,
> `PLAY_SERVICE_ACCOUNT_BASE64`)을 지원해서, 파일 없이 CI 시크릿으로 넣을 수
> 있어요.

다 채웠나요? 실행 전에 `npx storepulse doctor`로 방금 입력한 크리덴셜이
두 스토어에서 제대로 동작하는지 단계별로 미리 점검해볼 수도 있어요
(선택이에요).

### 3단계 — 실행

```sh
npx storepulse
```

여러분의 실제 보드가 나타나요 (레포 클론에서는 `pnpm status`로도 돼요).
크리덴셜에 문제가 있는 행은 보드 전체를 가리는 대신 그 자리에만 에러를
보여줘요.

### 선택 — Expo(EAS) 빌드 연결하기

Expo로 배포하고 있나요? 두 가지만 더하면 스토어의 각 버전이 어느 EAS
빌드에서 나왔는지까지 이어져요. 먼저 `.env`에 액세스 토큰을 넣어요
([expo.dev → Access tokens](https://expo.dev/settings/access-tokens)에서
만들 수 있어요. 조직이라면 **View Only** 로봇 토큰을 권장해요 —
storepulse는 빌드와 제출을 읽기만 하지, 실행하지 않거든요):

```ini
EAS_TOKEN=...
```

그다음 `storepulse.config.json`의 Expo 앱 항목에 `easProjectId`를 적어요
(`app.json` → `extra.eas.projectId`. 한 앱의 ios·android 항목은 같은 값을
써요):

```jsonc
{ "key": "myapp-ios", "platform": "ios", "storeId": "1234567890",
  "easProjectId": "5b2fb1e0-6c2a-4b8e-9d3f-4a1c2e8f7a90" }
```

이게 다예요 — 이제 보드, `snapshot`, 대시보드가 각 버전을 그 뒤의 EAS
빌드로 보강해줘요: git 커밋, 빌드 프로필, 제출 상태까지요. 대시보드 상세
패널에는 **EAS BUILD** 블록이 생기고, `npx storepulse doctor`는
`[5] Expo (EAS) 체인` 섹션에서 전체 연결을 점검해줘요. 스냅샷에는 선택
필드 `eas` / `easProjectId` / `easAppIdentifier`만 늘어나요 —
`schemaVersion`은 1 그대로예요 ([자세히](docs/snapshot-schema.md)).
하나의 EAS 프로젝트가 같은 플랫폼의 변형을 여러 개 빌드한다면
`easAppIdentifier`로 매칭 범위를 좁혀요 (Android는 기본으로 `storeId`를
써요).

![상세 패널의 EAS BUILD 블록 — 스토어 버전 옆에 빌드 프로필, git 커밋, 빌드 날짜, 제출 상태가 보여요](docs/images/dashboard-eas.png)

---

## 문제 해결

먼저 `npx storepulse doctor`를 실행해 보세요 — 아래 원인 대부분을 자동으로
진단하고, 실패 항목마다 한 줄 해결책을 알려줘요.

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
pnpm demo              # 샘플 데이터로 보드 표시
pnpm status            # 실제 설정으로 보드 표시
npx storepulse init    # 설정 + .env 템플릿 생성 (아무 폴더에서나 돼요)
npx storepulse doctor  # 크리덴셜·권한 진단 (401/403 원인 찾기)
pnpm typecheck         # 전체 패키지 tsc
pnpm test              # 유닛 테스트 (vitest)
pnpm lint              # Biome (린트 + 포맷 검사)
pnpm lint:fix          # 자동 수정
```

포맷팅과 린팅은 [Biome](https://biomejs.dev) 하나로 처리해요 — ESLint +
Prettier를 대신하는 단일 도구예요. 에디터는 Biome 확장만 설치하면
`biome.json`을 알아서 인식해요.

## 로드맵

- [x] EAS 커넥터 — 스토어 상태를 Expo 빌드·제출과 연결
- [ ] 상태가 바뀌면 Slack/Discord 알림 ("2.5.0 심사 통과 🎉")
- [x] 웹 대시보드 (`storepulse serve`)
- [x] npm 배포 (`npx storepulse`)
- [x] CLI 출력 영어·한국어 지원 (`--lang ko`, `storepulse explain`)

## 라이선스

[MIT](LICENSE)
