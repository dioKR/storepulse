<!-- logo: docs/images/logo.png (準備中) -->

# storepulse

[English](README.md) | [한국어](README.ko.md) | **日本語** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

**すべての iOS・Android アプリのリリース状況を、ひと目で。**

🌐 **Web サイト & チュートリアル → [diokr.github.io/storepulse](https://diokr.github.io/storepulse/ja/)**

いま公開されているのはどのバージョン? 審査で止まっているのは? TestFlight には
いま何が上がっている? — これを確かめるために App Store Connect と Google Play
Console をアプリごとに行き来しているなら、storepulse がその手間をなくします。
コマンドひとつ、ボードひとつです:

![storepulse デモ — pnpm demo がリリースボードを描くアニメーション](docs/images/demo.svg)

**Expo / React Native** チームを第一に考えて作りましたが、どんな iOS/Android
アプリでも使えます — storepulse が話す相手はビルドシステムではなく、
ストアだけですから。

- 🔍 **読み取り専用。** 両ストアの何ひとつ変更しません。
- 🔐 **認証情報はあなたのマシンから出ません。** storepulse は Apple と Google を
  直接呼び出します — サーバーも、アカウント登録も、テレメトリもありません。
- 🧩 **拡張しやすい。** コアはライブラリで、CLI はその最初の利用者にすぎません。

---

## まずは体験から — 認証情報は不要

サンプルデータだけで、storepulse が何をするのか 1 分で確かめられます。

**前提**: [Node.js](https://nodejs.org) 20.12 以上、
[pnpm](https://pnpm.io) 9 以上。

```sh
git clone https://github.com/dioKR/storepulse.git
cd storepulse
pnpm install
pnpm demo
```

これだけです — いま表示されたボードは、実際のチームを模したダミーデータです。
アプリ 2 つ、それぞれ prod・dev のバリアント、両プラットフォーム。

## ボードの読み方

各行は「1 つのアプリの 1 つのプラットフォーム」です。各列は**チャンネル** —
バージョンがユーザーに届くまでに滞在する場所です:

| 列 | iOS | Android |
|---|---|---|
| `PRODUCTION` | App Store | production トラック |
| `BETA / TESTFLIGHT` | TestFlight(外部) | オープン/クローズドテスト |
| `INTERNAL` | TestFlight(内部) | 内部テスト |

セルの中の各バージョンには**状態**バッジが付きます:

| バッジ | 意味 |
|---|---|
| `2.4.1 LIVE`(緑) | 全ユーザーに公開済み |
| `2.4.1 50%`(シアン) | 段階的リリース中 — ユーザーの 50% に配信済み |
| `2.5.0 REVIEW`(黄) | ストア審査の待機中 / 進行中 |
| `2.5.0 PENDING`(青) | 承認済みまたは処理中、まだ未公開 |
| `1.9.3 REJECTED`(赤) | 審査リジェクト — 要確認 |
| `2.5.1 draft`(淡色) | 準備済みだが未提出 |
| `(108)`(淡色) | ビルド番号 / versionCode |

1 つのセルに複数のバージョンが並ぶこともあります — `2.4.1 LIVE · 2.5.0 REVIEW`
は「ユーザーが使っているのは 2.4.1 で、2.5.0 は審査待ち」という意味です。
まさにこの「あいだの瞬間」を見えるようにするのが、このツールの存在理由です。

---

## 実際のアプリをつなぐ

3 ステップです: アプリを登録 → 認証情報を入力 → 実行。

### ステップ 1 — アプリを登録

サンプル設定をコピーして編集します:

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

| フィールド | 説明 |
|---|---|
| `key` | 重複しなければ何でも OK(内部用) |
| `name` | ボードに表示される名前 |
| `group` | 名前の横に付くラベル(任意)— 例: `prod` / `dev` |
| `platform` | `ios` または `android` |
| `storeId` | **iOS**: アプリの数字の Apple ID · **Android**: パッケージ名 |

**iOS の数字 ID はどこにある?** App Store Connect → 対象のアプリ →
**App 情報(App Information)** → 一般情報 → **Apple ID**(`1234567890` の
ような数字です):

![Apple ID の場所](docs/images/asc-app-id.png)

### ステップ 2 — 認証情報を入力

```sh
cp .env.example .env
```

次に `.env` を埋めます。必要なのは Apple から 1 つ、Google から 1 つ —
どちらも 5 分ほどで終わる、一度きりのセットアップです。

#### Apple — App Store Connect API キー

1. [App Store Connect](https://appstoreconnect.apple.com) →
   **ユーザーとアクセス(Users and Access)** → **統合(Integrations)** →
   **App Store Connect API** へ。
2. **チームキー(Team Keys)**で **＋** をクリックしてキーを作成します。
   ロールは **Developer** を推奨します — storepulse が読む範囲には
   これで十分です。**App Manager** でも動作しますが、キーが漏えいすると
   アプリの提出やメタデータの変更まで可能になってしまうので、
   最小権限で作るのが安全です。
3. **`.p8` ファイルをダウンロードします** — Apple がダウンロードを許すのは
   一度きり。大切に保管してください(このリポジトリではデフォルトで
   git 管理外です)。このキーはロールが許す範囲で書き込みもできる
   認証情報なので、万一漏えいしたら App Store Connect で直ちに
   失効(revoke)させてください。
4. 3 つの値を `.env` に写します:

```ini
ASC_KEY_ID=ABC123DEFG          # 作成したキーの "Key ID" 列
ASC_ISSUER_ID=xxxxxxxx-...     # ページ上部の "Issuer ID"
ASC_PRIVATE_KEY_PATH=./AuthKey_ABC123DEFG.p8
```

![App Store Connect API キーの作成画面](docs/images/asc-key.png)

#### Google — Play サービスアカウント

1. [Google Cloud Console](https://console.cloud.google.com) でプロジェクトを
   選ぶか新規作成し、**Google Play Android Developer API** を有効にします。
2. **IAM と管理 → サービスアカウント** → 1 つ作成(特別なロールは不要)→
   **キー**タブ → **鍵を追加 → JSON**。JSON ファイルがダウンロードされます。
3. [Play Console](https://play.google.com/console) →
   **ユーザーと権限** → **新しいユーザーを招待** → サービスアカウントの
   メールアドレス(`...@...iam.gserviceaccount.com`)を貼り付け → アプリに
   **アプリ情報の表示(View app information)** 権限を付与します。
   付与するのはこの権限だけにしてください — **リリース(公開)系の権限は
   決して付与しないでください。** storepulse には不要ですし、こうして
   おけばキーが漏えいしても読み取り専用のままで済みます。
4. `.env` にその JSON を指定します:

```ini
PLAY_SERVICE_ACCOUNT_PATH=./service-account.json
```

![Play Console でサービスアカウントを招待する画面](docs/images/play-invite.png)

> **CI のヒント**: どちらのシークレットも `*_BASE64` 形式
> (`ASC_PRIVATE_KEY_BASE64`, `PLAY_SERVICE_ACCOUNT_BASE64`)に対応して
> いるので、ファイルを置かずに CI シークレットとして渡せます。

### ステップ 3 — 実行

```sh
pnpm status
```

あなたの実際のボードが現れます。認証情報に問題のある行は、ボード全体を
隠す代わりに、その場所にエラーを表示するだけです。

---

## トラブルシューティング

| 症状 | 考えられる原因 |
|---|---|
| `ASC API 401` | Key ID / Issuer ID の誤り、または `.p8` がその Key ID のものではない |
| `ASC API 404` | `storeId` が*数字の* Apple ID ではない、またはキーのロールからそのアプリが見えない |
| `Play API 403` | Play Console にサービスアカウントが招待されていない、または Cloud プロジェクトで Android Developer API が無効 |
| `Play API 404` | パッケージ名のタイプミス、または一度もリリースされていないアプリ |
| Android の審査状況が出ない | バグではありません — Google の API が審査状況を提供していないためです([詳細](wiki/Architecture.md)) |

## アーキテクチャ

`@storepulse/core` が両ストアをひとつのモデル(チャンネル × 状態)に正規化し、
メソッド 2 つの `StoreConnector` インターフェースの向こうに隠します。CLI は
その最初の利用者にすぎません。ダイアグラムを含む全体像は
[**wiki/Architecture**](wiki/Architecture.md) をどうぞ。

## 開発

```sh
pnpm demo        # サンプルデータでボードを表示
pnpm status      # 実際の設定でボードを表示
pnpm typecheck   # 全パッケージで tsc
pnpm lint        # Biome(lint + フォーマットチェック)
pnpm lint:fix    # 自動修正
```

フォーマットと lint は [Biome](https://biomejs.dev) ひとつで済ませています —
ESLint + Prettier を置き換える単一ツールです。エディタは Biome 拡張を
入れれば `biome.json` を自動で認識します。

## ロードマップ

- [ ] EAS コネクタ — ストアの状態を Expo のビルド・提出と結びつける
- [ ] 状態変化時の Slack/Discord 通知(「2.5.0 審査通過 🎉」)
- [ ] Web ダッシュボード
- [ ] npm 公開(`npx storepulse`)
- [ ] CLI 出力の英語・韓国語対応

## ライセンス

[MIT](LICENSE)
