# @storepulse/core

Read-only TypeScript library that normalizes App Store Connect and Google Play
release status for dashboards, bots, and CI. It powers the
[`storepulse`](https://www.npmjs.com/package/storepulse) CLI, but can also be
embedded directly in your own tooling.

Both stores become one model: a `Channel` (`production` / `beta` / `internal`)
and a `ReleaseState` (`live`, `rollout`, `in-review`, `pending`, `rejected`,
`halted`, `draft`, or `unknown`).

Credentials are constructor arguments. This package never reads `process.env`
or the filesystem, and it never changes anything in a store.

## Install

### Node.js

```sh
npm install @storepulse/core
```

### Deno

```sh
deno add jsr:@storepulse/core
```

Or import it without an install step:

```ts
import { createSnapshot } from "jsr:@storepulse/core";
```

### Bun

```sh
bunx jsr add @storepulse/core
```

## Quick start

Use `MockConnector` to integrate and test without credentials or network access:

```ts
import { fetchAll, MockConnector } from "@storepulse/core";

const target = {
  key: "myapp-ios",
  name: "MyApp",
  platform: "ios" as const,
  storeId: "1234567890",
};

const [status] = await fetchAll(
  [
    new MockConnector({
      "myapp-ios": [
        { channel: "production", version: "1.2.0", build: "42", state: "live" },
      ],
    }),
  ],
  [target],
);

console.log(status.channels[0].version); // "1.2.0"
```

## Fetch live store status

Pass the contents of the App Store Connect `.p8` key or Google service-account
`private_key` to a connector. Do not put credentials in source code.

```ts
import { AscConnector, GooglePlayConnector, fetchAll } from "@storepulse/core";

const connectors = [
  new AscConnector({ keyId, issuerId, privateKey }),
  new GooglePlayConnector({ clientEmail, privateKey }),
];

const statuses = await fetchAll(connectors, [
  { key: "myapp-ios", name: "MyApp", platform: "ios", storeId: "1234567890" },
  {
    key: "myapp-android",
    name: "MyApp",
    platform: "android",
    storeId: "com.example.myapp",
  },
]);
```

In Deno, calls to Apple or Google need the runtime's network permission (for
example, `deno run --allow-net app.ts`).

## Main exports

| Export | Use it for |
| --- | --- |
| `fetchAll` / `StoreConnector` | Fetch normalized status from one or more sources. |
| `AscConnector` / `GooglePlayConnector` | Read App Store Connect or Google Play status. |
| `MockConnector` | Test integrations without store credentials. |
| `createSnapshot` | Create a portable `status.json` document. |
| `EasEnricher` | Attach matching Expo EAS build metadata. |

## Runtime support

Node.js, Deno, and Bun are verified in CI. Browser and Cloudflare Worker use is
not currently supported because the store APIs are not intended for direct
browser access.

## Links

- Website & tutorial: https://diokr.github.io/storepulse/
- GitHub: https://github.com/dioKR/storepulse
- License: MIT
