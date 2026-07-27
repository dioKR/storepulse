<!-- logo: docs/images/logo.png (即將推出) -->

# storepulse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | **繁體中文**

**所有 iOS · Android App 的發布狀態,一眼掌握。**

🌐 **網站 & 教學 → [diokr.github.io/storepulse](https://diokr.github.io/storepulse/zh-tw/)**

現在上線的是哪個版本?哪個版本卡在審查?TestFlight 上現在放的是什麼?——
如果確認這些事還得在 App Store Connect 和 Google Play Console 裡一個 App
一個 App 地點來點去,storepulse 就是為你準備的。一道指令,一塊看板:

![storepulse 展示 — pnpm demo 繪製即時發布看板](docs/images/demo.svg)

它以 **Expo / React Native** 團隊為優先設計,但任何 iOS/Android App 都適用
—— storepulse 只跟商店溝通,不碰你的建置系統。

- 🔍 **唯讀。** 不會更動兩家商店裡的任何東西。
- 🔐 **憑證不會離開你的電腦。** storepulse 直接呼叫 Apple 與 Google ——
  沒有伺服器、不用註冊帳號、也沒有遙測。
- 🧩 **易於擴充。** 核心是一個函式庫,CLI 只是它的第一個使用者。

---

## 先試試看 —— 不需要憑證

用範例資料,一分鐘內就能看到 storepulse 到底在做什麼。

**前置需求**:[Node.js](https://nodejs.org) 20.12 以上、
[pnpm](https://pnpm.io) 9 以上。

```sh
git clone https://github.com/dioKR/storepulse.git
cd storepulse
pnpm install
pnpm demo
```

就這樣 —— 你看到的看板是仿照真實團隊的假資料:兩個 App,各有 prod·dev
兩種變體,橫跨雙平台。

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

---

## 接上你的真實 App

三步驟:列出 App → 填入憑證 → 執行。

### 步驟 1 —— 列出 App

複製範例設定並修改:

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

| 欄位 | 說明 |
|---|---|
| `key` | 內部識別用,不重複即可 |
| `name` | 看板上顯示的名稱 |
| `group` | 名稱旁的標籤(選填)—— 例如 `prod` / `dev` |
| `platform` | `ios` 或 `android` |
| `storeId` | **iOS**:App 的數字 Apple ID · **Android**:套件名稱 |

**iOS 的數字 ID 去哪找?** App Store Connect → 你的 App →
**App 資訊(App Information)** → 一般資訊 → **Apple ID**(像
`1234567890` 這樣的數字):

![Apple ID 的位置](docs/images/asc-app-id.png)

### 步驟 2 —— 填入憑證

```sh
cp .env.example .env
```

接著填 `.env`。Apple 要一樣,Google 要一樣 —— 各花 5 分鐘左右,
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
   請妥善保管(本儲存庫已預設 git 忽略)。這把金鑰能在其角色允許的範圍內
   執行寫入,一旦外洩,請立刻到 App Store Connect 撤銷(revoke)。
4. 把三個值複製進 `.env`:

```ini
ASC_KEY_ID=ABC123DEFG          # 你建立的金鑰的 "Key ID" 欄
ASC_ISSUER_ID=xxxxxxxx-...     # 頁面上方的 "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

![建立 App Store Connect API 金鑰](docs/images/asc-key.png)

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

![在 Play Console 邀請服務帳戶](docs/images/play-invite.png)

> **CI 小提醒**:兩個金鑰都支援 `*_BASE64` 形式(`ASC_PRIVATE_KEY_BASE64`、
> `PLAY_SERVICE_ACCOUNT_BASE64`),可以直接存成 CI 密鑰,不必落地成檔案。

### 步驟 3 —— 執行

```sh
pnpm status
```

你的真實看板就會出現。憑證有問題的列只會在原位顯示錯誤,
不會遮住看板的其餘部分。

---

## 疑難排解

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

```sh
pnpm demo        # 用範例資料顯示看板
pnpm status      # 用真實設定顯示看板
pnpm typecheck   # 對所有套件執行 tsc
pnpm lint        # Biome(lint + 格式檢查)
pnpm lint:fix    # 自動修復
```

格式化與 lint 由 [Biome](https://biomejs.dev) 一個工具搞定 —— 它取代了
ESLint + Prettier。編輯器裝上 Biome 擴充功能,就會自動讀取 `biome.json`。

## 路線圖

- [ ] EAS 連接器 —— 把商店狀態與 Expo 的建置·送審串起來
- [ ] 狀態變化時的 Slack/Discord 通知(「2.5.0 審查通過 🎉」)
- [ ] Web 儀表板
- [x] 發布到 npm(`npx storepulse`)
- [ ] CLI 輸出支援英文·韓文

## 授權條款

[MIT](LICENSE)
