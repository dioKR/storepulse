# storepulse

**One-glance release status for all your iOS & Android apps.**

Which version is live? Which is stuck in review? What's on TestFlight? One
command shows every app you manage — versions, review states, rollout
percentages, test tracks — across App Store Connect **and** Google Play.

```sh
npx storepulse demo   # see the board with sample data — no credentials needed
```

- 🔍 **Read-only** — never changes anything in either store
- 🔐 **Credentials stay on your machine** — direct API calls, no server, no telemetry
- 🧩 Built on [`@storepulse/core`](https://www.npmjs.com/package/@storepulse/core), embeddable in your own tools

## Commands

```sh
npx storepulse            # release board for storepulse.config.json
npx storepulse init       # scaffold storepulse.config.json + .env templates here
npx storepulse demo       # the board with sample data — no credentials needed
npx storepulse snapshot   # the board as JSON (--demo, --out <file>)
npx storepulse serve      # local web dashboard (--demo, --port, --host, --refresh)
npx storepulse explain    # badge glossary (explain <state> for one state in depth)
npx storepulse doctor     # diagnose credentials & permissions (find the 401/403)
```

Every command accepts `--lang ko|en` (or `STOREPULSE_LANG`; falls back to your
OS locale) to switch CLI messages between English and Korean.

`serve` binds to `127.0.0.1` by default — click a row for release notes,
dates, and TestFlight expiry, and filter by OS/group with the chips at the
top. The JSON document written by
`snapshot` (and served at `/api/status`) is specified in
[docs/snapshot-schema.md](https://github.com/dioKR/storepulse/blob/main/docs/snapshot-schema.md).

## Real apps

1. Run `npx storepulse init` — it scaffolds `storepulse.config.json` (app
   list) and a `.env` template in the current folder, never overwriting
   existing files, and git-ignores the credential files.
2. Fill them in: your apps in the config, an App Store Connect API key and a
   Google Play service account in `.env`.
3. Run `npx storepulse`.

Full step-by-step tutorial:
**https://diokr.github.io/storepulse/**

## Links

- Website & tutorial: https://diokr.github.io/storepulse/
- GitHub: https://github.com/dioKR/storepulse
- License: MIT
