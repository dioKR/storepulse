# Snapshot schema (`status.json`)

A **snapshot** is a point-in-time JSON export of the release board — the
single data contract between everything that produces status and everything
that consumes it:

| Producer | Consumer |
| --- | --- |
| `storepulse snapshot [--demo] [--out <file>]` | the web dashboard (`packages/dashboard`) |
| `storepulse serve` (`GET /api/status`, `GET /status.json`) | your own scripts / CI artifacts |

It contains **only normalized store data** — never credentials, tokens, or
anything derived from them. It is safe to commit as a CI artifact, but note
that it may list unreleased version numbers.

## Versioning

- `schemaVersion` is an **integer, starting at 1**.
- It is bumped **only on breaking changes** to the document shape
  (renaming/removing a field, changing a type or meaning).
- Adding new *optional* fields does **not** bump it.
- Consumers should check `schemaVersion` and degrade gracefully on versions
  they don't know (the bundled dashboard renders best-effort with a warning).

Current version: **1**.

## Top-level document

```jsonc
{
  "schemaVersion": 1,                        // integer >= 1
  "generatedAt": "2026-07-27T12:34:56.789Z", // ISO 8601, when the document was generated
  "apps": [ /* AppStatus[] — one entry per configured target */ ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | integer | Format version of this document, see above |
| `generatedAt` | string | ISO 8601 timestamp of document generation |
| `apps` | `AppStatus[]` | One entry per target, in config order |

## `AppStatus`

| Field | Type | Notes |
| --- | --- | --- |
| `target` | `AppTarget` | The configured app this row describes |
| `channels` | `ChannelStatus[]` | Releases per channel; may be empty |
| `fetchedAt` | string | ISO 8601 timestamp of the store API call |
| `error` | string? | Present when the connector failed for this target; `channels` is then usually empty. One bad credential never hides the rest of the board. |

## `AppTarget`

| Field | Type | Notes |
| --- | --- | --- |
| `key` | string | Unique key within a config, e.g. `"myapp-prod-ios"` |
| `name` | string | Display name, e.g. `"MyApp"` |
| `platform` | `"ios" \| "android"` | |
| `storeId` | string | ASC numeric app ID (ios) or package name (android) |
| `group` | string? | Optional display grouping, e.g. `"prod"` / `"dev"` |

## `ChannelStatus`

| Field | Type | Notes |
| --- | --- | --- |
| `channel` | `"production" \| "beta" \| "internal"` | Unified channel across both stores |
| `version` | string \| null | Marketing version, e.g. `"2.4.1"`; `null` when the channel has no release |
| `build` | string \| null? | Build number (iOS) / versionCode (Android) |
| `state` | `ReleaseState` | See below |
| `rawState` | string? | Store-specific state string, e.g. `"READY_FOR_SALE"`, `"production/inProgress"` |
| `rolloutPercent` | number? | 0–100, present while `state` is `"rollout"` |
| `releaseNotes` | string? | Release notes for this release, line breaks preserved. iOS: App Store "What's New" (locale priority ko → en-US → first available). Android: `release.releaseNotes[]` text (ko-KR → en-US → first available). |
| `date` | string? | ISO 8601. iOS only: `appStoreVersion.createdDate` (production) / TestFlight build `uploadedDate` (beta) |
| `expiresAt` | string? | ISO 8601. TestFlight builds only: `expirationDate` of the beta build |

`releaseNotes`, `date`, and `expiresAt` were added as **optional** fields after
the initial release. Per the versioning rule above — *"Adding new optional
fields does **not** bump it"* — `schemaVersion` remains **1**; consumers that
ignore them keep working unchanged.

### `ReleaseState`

| Value | Meaning |
| --- | --- |
| `live` | READY_FOR_SALE / track release completed |
| `rollout` | Phased release (iOS) / staged rollout (Android) in progress |
| `in-review` | Waiting for / in review |
| `pending` | Approved, waiting for developer release / processing |
| `rejected` | Any `*_REJECTED` state |
| `halted` | Rollout halted |
| `draft` | PREPARE_FOR_SUBMISSION / draft release |
| `unknown` | Unmapped store state — check `rawState`. Renderers must display this loudly (gray UNKNOWN badge), never hide it. |

Consumers must tolerate **unknown `state` values** beyond this list: treat
anything unrecognized like `unknown`. That is how an upstream store API
change degrades — visibly, not silently.

## Example

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-27T12:34:56.789Z",
  "apps": [
    {
      "target": {
        "key": "aurora-ios",
        "name": "Aurora",
        "group": "prod",
        "platform": "ios",
        "storeId": "1"
      },
      "channels": [
        {
          "channel": "production",
          "version": "2.4.1",
          "state": "live",
          "rawState": "READY_FOR_SALE",
          "date": "2026-07-06T09:00:00Z",
          "releaseNotes": "· 홈 피드 로딩 속도 개선\n· 자잘한 버그 수정"
        },
        {
          "channel": "beta",
          "version": "2.5.0",
          "build": "108",
          "state": "live",
          "rawState": "VALID",
          "date": "2026-07-21T10:00:00Z",
          "expiresAt": "2026-10-19T10:00:00Z"
        }
      ],
      "fetchedAt": "2026-07-27T12:34:56.123Z"
    },
    {
      "target": {
        "key": "aurora-android",
        "name": "Aurora",
        "group": "prod",
        "platform": "android",
        "storeId": "com.example.aurora"
      },
      "channels": [
        {
          "channel": "production",
          "version": "2.4.1",
          "build": "241",
          "state": "rollout",
          "rawState": "production/inProgress",
          "rolloutPercent": 50
        }
      ],
      "fetchedAt": "2026-07-27T12:34:56.456Z"
    }
  ]
}
```

Generate this example's real-world equivalent with:

```sh
storepulse snapshot --demo            # sample data to stdout
storepulse snapshot --out status.json # your real board to a file
```
