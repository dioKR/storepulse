# @storepulse/core

Normalized release status for App Store Connect and Google Play — the engine
behind the [`storepulse`](https://www.npmjs.com/package/storepulse) CLI.
Embed it in your own dashboard, Slack bot, or CI job.

Both stores are translated into one model: a `Channel`
(`production` / `beta` / `internal`) × a `ReleaseState`
(`live`, `rollout` + %, `in-review`, `pending`, `rejected`, `halted`, `draft`).

Credentials are **constructor arguments** — this library never reads
`process.env` or the filesystem.

```ts
import { AscConnector, GooglePlayConnector, fetchAll } from "@storepulse/core";

const connectors = [
  new AscConnector({ keyId, issuerId, privateKey }),          // .p8 contents
  new GooglePlayConnector({ clientEmail, privateKey }),       // service account
];

const statuses = await fetchAll(connectors, [
  { key: "myapp-ios", name: "MyApp", platform: "ios", storeId: "1234567890" },
  { key: "myapp-android", name: "MyApp", platform: "android", storeId: "com.example.myapp" },
]);
// → AppStatus[]: per-target channels with normalized states, per-target errors
```

Add your own source by implementing the two-method `StoreConnector` interface.

## Links

- Website & tutorial: https://diokr.github.io/storepulse/
- GitHub: https://github.com/dioKR/storepulse
- License: MIT
