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
| `latestTesterUrl` | string? | Android-only fixed HTTPS testing link that serves the latest eligible build. |
| `installLinks` | `Record<string, string>`? | Android-only verified HTTPS install URLs keyed by versionCode. Values are exact provider-returned URLs; consumers must not synthesize missing links. |
| `group` | string? | Optional display grouping, e.g. `"prod"` / `"dev"` |
| `easProjectId` | string? | EAS project ID (`app.json` → `extra.eas.projectId`). The ios and android targets of one app share the same value — the platform split happens in the EAS build query. |
| `easAppIdentifier` | string? | App identifier the target's EAS builds carry (iOS bundle ID / Android package name). Scopes EAS matching when one EAS project builds several variants of a platform. Android defaults to `storeId`; set it explicitly to enable scoping on iOS. |

## `ChannelStatus`

| Field | Type | Notes |
| --- | --- | --- |
| `channel` | `"production" \| "beta" \| "internal"` | Unified channel across both stores |
| `version` | string \| null | Marketing version, e.g. `"2.4.1"`; `null` when the channel has no release |
| `build` | string \| null? | Build number (iOS) / versionCode (Android) |
| `state` | `ReleaseState` | See below |
| `rawState` | string? | Store-specific state string, e.g. `"READY_FOR_SALE"`, `"production/inProgress; lifecycle=RELEASE_LIFECYCLE_STATE_PUBLISHED"` |
| `rolloutPercent` | number? | 0–100, present while `state` is `"rollout"` |
| `releaseNotes` | string? | Release notes for this release, line breaks preserved. iOS: App Store "What's New" (locale priority ko → en-US → first available). Android: `release.releaseNotes[]` text (ko-KR → en-US → first available). |
| `date` | string? | ISO 8601. iOS only: `appStoreVersion.createdDate` (production) / TestFlight build `uploadedDate` (beta) |
| `expiresAt` | string? | ISO 8601. TestFlight builds only: `expirationDate` of the beta build |
| `eas` | `EasBuildInfo`? | EAS build matched to this release (see below). Present only when the EAS enricher is configured **and** a build matched this entry's `version`/`build`. |
| `easUpdate` | `EasUpdateInfo`? | Latest EAS Update (OTA) matched to this exact native binary by app version, native build number, and app identifier (see below). |

`releaseNotes`, `date`, `expiresAt`, `eas`, `easUpdate`, `AppTarget.latestTesterUrl`, `AppTarget.installLinks`,
`AppTarget.easProjectId`, and `AppTarget.easAppIdentifier` were
added as **optional** fields after the initial release. Per the versioning rule
above — *"Adding new optional fields does **not** bump it"* — `schemaVersion`
remains **1**; consumers that ignore them keep working unchanged.

### `EasBuildInfo`

Supplementary Expo (EAS) build info: *"the 2.5.0 in review — which
commit/profile/build is it?"*. Matching: the channel's marketing `version`
must equal the EAS build's `appVersion`; when the channel has a `build`
(iOS build number / Android versionCode) it must equal `appBuildVersion`
too. No match → the `eas` field is simply absent, never an error.

| Field | Type | Notes |
| --- | --- | --- |
| `profile` | string? | EAS build profile, e.g. `"production"` |
| `commit` | string? | Full git commit hash of the build (`gitCommitHash`) |
| `buildId` | string? | EAS build ID (UUID) — `eas build:view <id>` |
| `completedAt` | string? | ISO 8601, when the EAS build finished |
| `submissionStatus` | string? | Latest EAS submission status for the build, e.g. `"FINISHED"`, `"IN_PROGRESS"` — an EAS term passed through verbatim |

### `EasUpdateInfo`

The latest Expo OTA deployment that targets the store binary represented by
the channel entry. storepulse reads binary identity from the update's
`manifestFragment.extra.expoClient` and matches app version, iOS build number
or Android versionCode, and bundle/package identifier. This also works for
binaries built locally and submitted to a store, because no EAS Build record
is required. Custom Play release names can fall back to a unique versionCode.
If matching records span multiple EAS branches, or native identity is otherwise
ambiguous or incomplete, the update is left unmatched rather than guessed.

| Field | Type | Notes |
| --- | --- | --- |
| `groupId` | string? | EAS Update group ID (UUID) |
| `branch` | string? | EAS Update branch, e.g. `"production"` |
| `message` | string? | Update message supplied when publishing |
| `commit` | string? | Full git commit hash recorded for the update |
| `createdAt` | string? | ISO 8601, when the OTA update was published |
| `runtimeVersion` | string? | EAS runtime version targeted by the update |
| `rolloutPercentage` | number? | 0–100 when the update uses a staged rollout |
| `manifestPermalink` | string? | Expo-hosted manifest URL |
| `isRollbackToEmbedded` | boolean? | Whether the update rolls clients back to the embedded bundle |

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

For Google Play, storepulse combines the track configuration with the release
lifecycle matched by versionCode. Review, approval, and rejection lifecycle
states take precedence. An `inProgress` track becomes `rollout` only when the
lifecycle is `RELEASE_LIFECYCLE_STATE_PUBLISHED`; otherwise it remains visibly
`unknown` rather than reporting a rollout percentage that may only be the
configured target percentage.

Lifecycle lookups are cached per package and track for one hour, and tracks
without any versioned release are skipped. A build that was not present when
the track was cached triggers an immediate refresh; if that refresh fails, the
unverified build remains `unknown` rather than inheriting the older track
state. If a refresh fails after a successful lookup, the last lifecycle value
remains in use and `rawState` includes `lifecycleCache=stale`. If Google rejects the first
lookup because its listing quota is exhausted, the release stays `unknown`,
`rawState` includes `lifecycle=(quota-exceeded)`, and storepulse waits one hour
before retrying that track. These are raw-state value changes only;
`schemaVersion` remains **1**.

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
        "storeId": "1",
        "easProjectId": "5b2fb1e0-6c2a-4b8e-9d3f-4a1c2e8f7a90"
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
          "expiresAt": "2026-10-19T10:00:00Z",
          "eas": {
            "profile": "production",
            "commit": "8c1f37ab90d24e5f6a7b8c9d0e1f2a3b4c5d6e7f",
            "buildId": "3f6b9d21-84a5-4c7e-b0d2-5e8f1a3c6b90",
            "completedAt": "2026-07-21T09:30:00Z",
            "submissionStatus": "FINISHED"
          },
          "easUpdate": {
            "groupId": "52c1c6ea-31db-49a5-b178-91e94ea9ab8b",
            "branch": "production",
            "message": "Fix widget refresh after account switching",
            "commit": "a7c4e12f9d2a8b6c1e3f4a5b6c7d8e9f0a1b2c3d",
            "createdAt": "2026-07-26T04:20:00Z",
            "runtimeVersion": "runtime-ios-108"
          }
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
        "storeId": "com.example.aurora",
        "latestTesterUrl": "https://play.google.com/apps/internaltest/1234567890",
        "installLinks": {
          "241": "https://play.google.com/apps/test/com.example.aurora/241"
        }
      },
      "channels": [
        {
          "channel": "production",
          "version": "2.4.1",
          "build": "241",
          "state": "rollout",
          "rawState": "production/inProgress; lifecycle=RELEASE_LIFECYCLE_STATE_PUBLISHED",
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
