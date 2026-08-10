<!-- logo: docs/images/logo.png (即將推出) -->

# storepulse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | **繁體中文**

**所有 iOS · Android App 的發布狀態,一眼掌握。**

🌐 **網站 & 教學 → [diokr.github.io/storepulse](https://diokr.github.io/storepulse/zh-tw/)**

現在上線的是哪個版本?哪個版本卡在審查?TestFlight 上現在放的是什麼?——
如果確認這些事還得在 App Store Connect 和 Google Play Console 裡一個 App
一個 App 地點來點去,storepulse 就是為你準備的。一道指令,一塊看板:

![storepulse 展示 — npx storepulse demo 繪製即時發布看板](docs/images/demo.svg)

現在就能試 —— 不需要憑證、不需要設定,也不用 clone 儲存庫。
有 [Node.js](https://nodejs.org) 20.12 以上就夠了:

```sh
npx storepulse demo           # 發布看板,直接出現在終端機裡
npx storepulse serve --demo   # 同一塊看板,變成本機 Web 儀表板 → http://127.0.0.1:4780
```

你看到的看板是仿照真實團隊的假資料:兩個 App,各有 prod·dev 兩種變體,
橫跨雙平台。

它以 **Expo / React Native** 團隊為優先設計,但任何 iOS/Android App 都適用
—— storepulse 只跟商店溝通,不碰你的建置系統。

- 🔍 **唯讀。** 不會更動兩家商店裡的任何東西。
- 🔐 **憑證不會離開你的電腦。** storepulse 直接呼叫 Apple 與 Google ——
  沒有伺服器、不用註冊帳號、也沒有遙測。
- 🧩 **易於擴充。** 核心是一個函式庫,CLI 只是它的第一個使用者。

---

## storepulse 適合你嗎?

storepulse 是**為小型 Expo / React Native 團隊打造的本機、唯讀、送出後
(post-submit)發布可觀測工具** —— 它只盯著你按下「送出」之後發布的去向,
僅此而已。

**這些情況下它很合適:**

- 想在同一塊看板上看到所有 App 的上線版本、審查狀態、逐步發布比例與測試
  軌道 —— 用終端機、瀏覽器,或在 CI 裡輸出 JSON
- 想讓商店憑證只留在自己的電腦上 —— 沒有帳號、沒有託管伺服器、沒有遙測

**如果你需要下面這些,請另尋工具:**

- 送出、推進或操控發布的逐步發布 —— storepulse 從不對任何一家商店寫入
- ASO、評論/評分分析或營收報表
- 託管的 SaaS —— storepulse 只在你執行它的地方執行

## 怎麼看這塊看板

每一列是「一個 App 的一個平台」。每一欄是一個**通道** ——
版本在抵達使用者之前所停留的位置:

| 欄 | iOS | Android |
|---|---|---|
| `PRODUCTION` | App Store | production 軌道 |
| `BETA / TESTFLIGHT` | TestFlight(外部) | 開放/封閉測試 |
| `INTERNAL` | TestFlight(內部) | 內部測試 |

儲存格裡的每個版本都帶著**狀態**徽章:

| 徽章 | 意義 |
|---|---|
| `2.4.1 LIVE`(綠) | 已全面發布,使用者可用 |
| `2.4.1 50%`(青) | 逐步發布中 —— 50% 的使用者已拿到 |
| `2.5.0 REVIEW`(黃) | 等待/正在商店審查 |
| `2.5.0 PENDING`(藍) | 已核准或處理中,尚未發布 |
| `1.9.3 REJECTED`(紅) | 審查遭拒 —— 需要你處理 |
| `2.5.1 draft`(暗) | 已準備但尚未送出 |
| `(108)`(暗) | 建置編號 / versionCode |

一個儲存格裡可能同時有多個版本 —— `2.4.1 LIVE · 2.5.0 REVIEW` 的意思是
「使用者用的是 2.4.1,而 2.5.0 正在等審查」。讓這個「中間時刻」變得可見,
正是這個工具存在的意義。

忘了徽章代表什麼?圖例就內建在 CLI 裡:

```sh
npx storepulse explain            # 一覽所有狀態
npx storepulse explain rejected   # 深入單一狀態 —— 意義、商店原始狀態、建議動作
```

CLI 的提示、錯誤與說明文字支援英文和韓文 —— 用 `--lang ko|en` 或
`STOREPULSE_LANG` 選擇,未指定時跟隨作業系統的語系(徽章與欄位標題
在兩種語言下都維持英文)。

## 同一塊看板,搬進瀏覽器,或輸出成 JSON

CLI 看板還有兩道兄弟指令。都支援展示模式,不需要憑證:

```sh
npx storepulse serve --demo     # 本機 Web 儀表板 → http://127.0.0.1:4780
npx storepulse snapshot --demo  # 把看板輸出成 JSON
```

![storepulse Web 儀表板 —— 全寬版面,每列帶 Latest 摘要,每個有版本的通道前有 ✓/▲ 傳播標記](docs/images/dashboard-propagation.png)

- **`storepulse serve`** 會啟動一個本機 Web 儀表板 —— 同一塊看板、同樣的
  設計,還會自動重新整理。點選任一列就會展開詳細面板:版本說明全文、
  送審/上傳日期,TestFlight 有效期限剩不到 7 天時還會亮出倒數警告。上方的
  篩選標籤可以依 OS(iOS/Android)與群組(`prod`/`dev`)組合過濾看板。
  每列還帶著最新建置的摘要(`Latest: 2.5.0 (108)`),每個有版本的通道前有一個傳播
  標記 —— 已經拿到最新建置顯示 ✓,落後了則顯示 ▲(游標移上去可對照目前 vs
  最新;Android 以 versionCode 判斷)——「最新建置到底發到了哪些環境」
  一眼就能看清。
  頂欄的 EN/KO 切換器可以切換儀表板語言(選擇會記在瀏覽器裡),點一下
  狀態徽章(而不是整列)會跳出解釋該狀態意義的術語對話方塊。
  選項:`--port`、`--host`、`--refresh <秒>`。預設
  只綁定 `127.0.0.1` —— 看板上可能出現尚未發布的版本號,對外開放前請三思。
- **`storepulse snapshot`** 會把看板輸出成 JSON(`--out <檔案>` 可寫入檔案)
  —— 適合 CI 產物或你自己的腳本。文件格式請見
  [docs/snapshot-schema.md](docs/snapshot-schema.md)。

![韓文介面的看板 —— EN/KO 切換器就在頂欄](docs/images/dashboard-i18n.png)

![點一下狀態徽章跳出的術語解釋對話方塊 —— 和 `storepulse explain` 輸出的是同一套說明](docs/images/dashboard-explain.png)

拿掉 `--demo`,兩道指令就會使用下方設定的真實 App。

想讓整個團隊在線上看這塊看板?**[部署指南](docs/deploy/README.md)** 涵蓋 AWS、Cloudflare、Vercel、Netlify 與 Google Cloud —— 內建快照定期更新與存取控制。

## 把發布狀態變成 CI 政策關卡

`storepulse check` 會收集同一份商店資料;只要任一通道狀態符合
`--fail-on` 指定的值,就讓 CI 失敗:

```sh
npx storepulse check --fail-on rejected,halted
npx storepulse check --fail-on rejected,halted --format json
```

支援的狀態有 `live`、`rollout`、`in-review`、`pending`、`rejected`、
`halted`、`draft` 與 `unknown`。收集成功且無符合項目時結束碼為 `0`,發現
政策違規時為 `1`,參數錯誤或收集失敗時為 `2`。這樣 CI 就能區分政策違規
與憑證、設定或商店 API 故障。不用憑證試用時,加上 `--demo` 即可。

---

## 接上你的真實 App

三步驟:列出 App → 填入憑證 → 執行。

### 步驟 1 —— 列出 App

先產生設定檔 —— 不必 clone 儲存庫,在任何資料夾裡都行:

```sh
npx storepulse init
```

這道指令會建立 `storepulse.config.json` 與 `.env` 範本(已存在的檔案絕不會被
覆寫),並把憑證檔案加進 `.gitignore` 以免誤提交,接著在終端機列出後續步驟
(`--lang ko|en`)。(若你是 clone 本儲存庫來開發,`cp
storepulse.config.example.json storepulse.config.json` 也能得到同一份檔案。)

接著打開 `storepulse.config.json`,列出你的 App:

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

| 欄位 | 說明 |
|---|---|
| `key` | 內部識別用,不重複即可 |
| `name` | 看板上顯示的名稱 |
| `group` | 名稱旁的標籤(選填)—— 例如 `prod` / `dev` |
| `platform` | `ios` 或 `android` |
| `storeId` | **iOS**:App 的數字 Apple ID · **Android**:套件名稱 |

**iOS 的數字 ID 去哪找?** App Store Connect → 你的 App →
**App 資訊(App Information)** → 一般資訊 → **Apple ID**(像
`1234567890` 這樣的數字)。

### 步驟 2 —— 填入憑證

接著填 `storepulse init` 建立的 `.env`(儲存庫 clone 裡則用
`cp .env.example .env`)。Apple 要一樣,Google 要一樣 —— 各花 5 分鐘左右,
都是一次性設定。

#### Apple —— App Store Connect API 金鑰

1. 打開 [App Store Connect](https://appstoreconnect.apple.com) →
   **使用者與存取權(Users and Access)** → **整合(Integrations)** →
   **App Store Connect API**。
2. 在**團隊金鑰(Team Keys)**按 **＋** 產生金鑰。
   角色建議選 **Developer** —— 對 storepulse 的讀取來說已經足夠。
   **App Manager** 也能用,但金鑰一旦外洩,提交 App、更動中繼資料的權限
   也會跟著流出,依最小權限原則比較穩妥。
3. **下載 `.p8` 檔案** —— Apple 只允許下載一次。
   請妥善保管(`storepulse init` 已把它加入 git 忽略)。這把金鑰能在其角色允許的範圍內
   執行寫入,一旦外洩,請立刻到 App Store Connect 撤銷(revoke)。
4. 把三個值複製進 `.env`:

```ini
ASC_KEY_ID=ABC123DEFG          # 你建立的金鑰的 "Key ID" 欄
ASC_ISSUER_ID=xxxxxxxx-...     # 頁面上方的 "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

主控台介面時常變動 —— 如果選單位置對不上,請按照 Apple 官方指南
[Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) 操作。

#### Google —— Play 服務帳戶

1. 在 [Google Cloud Console](https://console.cloud.google.com) 選擇(或建立)
   一個專案,啟用 **Google Play Android Developer API**。
2. **IAM 與管理 → 服務帳戶** → 建立一個(不需要特殊角色)→
   **金鑰**分頁 → **新增金鑰 → JSON**,瀏覽器會下載一個 JSON 檔。
3. 打開 [Play Console](https://play.google.com/console) →
   **使用者與權限** → **邀請新使用者** → 貼上服務帳戶信箱
   (`...@...iam.gserviceaccount.com`)→ 為你的 App 授予
   **檢視應用程式資訊(View app information)**權限。只授予這一項 ——
   **千萬不要授予任何發布(Release)權限**;storepulse 用不到,
   這樣即使金鑰外洩也只停留在唯讀。
4. 讓 `.env` 指向該 JSON:

```ini
PLAY_SERVICE_ACCOUNT_PATH=./service-account.json
```

如果主控台版面有變,Google 官方的
[Google Play Developer API 入門指南](https://developers.google.com/android-publisher/getting_started)涵蓋了同樣的步驟。

> **CI 小提醒**:兩個金鑰都支援 `*_BASE64` 形式(`ASC_PRIVATE_KEY_BASE64`、
> `PLAY_SERVICE_ACCOUNT_BASE64`),可以直接存成 CI 密鑰,不必落地成檔案。

都填好了?正式執行前,還可以先用 `npx storepulse doctor` 逐步檢查一遍
剛填入的憑證在兩家商店是否有效(選用)。

### 步驟 3 —— 執行

```sh
npx storepulse
```

你的真實看板就會出現(在儲存庫的 clone 裡,`pnpm status` 效果相同)。
憑證有問題的列只會在原位顯示錯誤,不會遮住看板的其餘部分。

### 選用 —— 串接 Expo(EAS)建置

用 Expo 出版本嗎?再加兩樣東西,商店裡的每個版本就能一路追溯到產出它的
EAS 建置。先把存取權杖放進 `.env`(在
[expo.dev → Access tokens](https://expo.dev/settings/access-tokens) 建立;
組織帳號建議用 **View Only** 機器人權杖 —— storepulse 只讀取建置和送審,
絕不會觸發它們):

```ini
EAS_TOKEN=...
```

接著為 `storepulse.config.json` 裡的 Expo App 項目加上 `easProjectId`
(`app.json` → `extra.eas.projectId`;同一個 App 的 ios·android 項目共用
同一個值):

```jsonc
{ "key": "myapp-ios", "platform": "ios", "storeId": "1234567890",
  "easProjectId": "5b2fb1e0-6c2a-4b8e-9d3f-4a1c2e8f7a90" }
```

就這樣 —— `snapshot` 和 Web 儀表板會為每個版本補上它背後的 EAS
建置資訊:git commit、建置設定檔(profile)、送審狀態(終端機看板刻意
維持單行摘要)。儀表板詳細面板會
多出 **EAS BUILD** 區塊,`npx storepulse doctor` 也會在 `[5] Expo (EAS)`
一節逐步檢查整條鏈路。快照只新增選用欄位 `eas` / `easProjectId` /
`easAppIdentifier` —— `schemaVersion` 維持為 1
([詳情](docs/snapshot-schema.md))。如果一個 EAS 專案為同一平台建置多種
變體,用 `easAppIdentifier` 收斂比對範圍(Android 預設使用 `storeId`)。

![詳細面板裡的 EAS BUILD 區塊 —— 商店版本旁邊是建置設定檔、git commit、建置日期和送審狀態](docs/images/dashboard-eas.png)

---

## 疑難排解

先執行 `npx storepulse doctor` —— 下面這些原因,它大多能自動診斷出來,
每個失敗項目還會給出一行解決辦法。

| 症狀 | 最可能的原因 |
|---|---|
| `ASC API 401` | Key ID / Issuer ID 填錯,或 `.p8` 不屬於該 Key ID |
| `ASC API 404` | `storeId` 不是*數字* Apple ID,或金鑰的角色看不到這個 App |
| `Play API 403` | 服務帳戶尚未被邀請進 Play Console,或 Cloud 專案裡的 Android Developer API 未啟用 |
| `Play API 404` | 套件名稱打錯,或這個 App 從未發布過 |
| Android 看不到審查狀態 | 不是 bug —— Google 的 API 沒有提供審查狀態([詳情](wiki/Architecture.md)) |

## 架構

`@storepulse/core` 把兩家商店正規化成同一個模型(通道 × 狀態),藏在只有
兩個方法的 `StoreConnector` 介面後面;CLI 只是它的第一個使用者。
完整的架構圖與說明請見 [**wiki/Architecture**](wiki/Architecture.md)。

## 開發

想參與開發 storepulse 本身?clone 儲存庫即可 —— 只有這條路徑需要
[pnpm](https://pnpm.io) 9 以上:

```sh
git clone https://github.com/dioKR/storepulse.git
cd storepulse
pnpm install
```

```sh
pnpm demo              # 用範例資料顯示看板
pnpm status            # 用真實設定顯示看板
npx storepulse init    # 產生設定 + .env 範本(任何資料夾皆可)
npx storepulse doctor  # 診斷憑證與權限(找出 401/403 的原因)
pnpm typecheck         # 對所有套件執行 tsc
pnpm test              # 單元測試(vitest)
pnpm lint              # Biome(lint + 格式檢查)
pnpm lint:fix          # 自動修復
```

格式化與 lint 由 [Biome](https://biomejs.dev) 一個工具搞定 —— 它取代了
ESLint + Prettier。編輯器裝上 Biome 擴充功能,就會自動讀取 `biome.json`。

## 路線圖

已經完成的:

- [x] EAS 連接器 —— 把商店狀態與 Expo 的建置·送審串起來
- [x] Web 儀表板(`storepulse serve`)
- [x] 發布到 npm(`npx storepulse`)
- [x] CLI 輸出支援英文·韓文(`--lang ko`、`storepulse explain`)
- [x] 快照 diff 引擎(`storepulse diff`)
- [x] CI 政策關卡(`storepulse check --fail-on`)

接下來要做的([完整路線圖](https://github.com/dioKR/storepulse/issues/57)):

- [ ] 提供定期檢查與 Job Summary 的官方 GitHub Action
- [ ] 發布變化的 generic webhook 事件 —— Slack、Discord 或你自己的自動化
  都能串接
- [ ] 本機 watch 模式

## 授權條款

[MIT](LICENSE)
