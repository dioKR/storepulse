# The snapshot-refresh workflow (GitHub Actions)

Every deployment in this directory is driven by one GitHub Actions workflow:
on a schedule it generates a fresh `status.json` with your store credentials,
assembles the static dashboard, and hands the result to a provider-specific
upload step. This page defines that common workflow; each provider guide only
replaces the final step.

## Prerequisites

- A **private** GitHub repository dedicated to the board deployment (the
  config file lists your whole app portfolio — keep it private). Your app
  monorepo works too, but a small separate repo keeps secrets scoped.
- Working credentials, verified locally first (see the
  [main README](../../README.md#connect-your-real-apps)).

## Step 1 — Repository layout

```
storepulse-board/                      # private repo
├── package.json                       # pins the storepulse version
├── package-lock.json                  # lockfile → reproducible, auditable CI
├── storepulse.config.json             # your app list (no secrets in here)
└── .github/workflows/
    └── storepulse-snapshot.yml        # the workflow below
```

Create the package files by pinning `storepulse` as a dev dependency:

```sh
npm init -y
npm install --save-dev storepulse
```

Copy your working `storepulse.config.json` in (structure only — secrets stay
in the environment, never in this file).

## Step 2 — Add the secrets

In the repo: **Settings → Secrets and variables → Actions → New repository
secret**. Create these four:

| Secret | Value |
|---|---|
| `ASC_KEY_ID` | The App Store Connect key ID |
| `ASC_ISSUER_ID` | The issuer ID |
| `ASC_PRIVATE_KEY_BASE64` | The `.p8` file, base64-encoded |
| `PLAY_SERVICE_ACCOUNT_BASE64` | The service-account JSON, base64-encoded |

storepulse reads the `*_BASE64` variants directly — no key files ever touch
the runner's checkout. Encode them locally:

```sh
# macOS
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
base64 -i service-account.json | pbcopy

# Linux
base64 -w0 AuthKey_XXXXXXXXXX.p8
base64 -w0 service-account.json
```

Use the least-privileged credentials you can: an ASC key with the
**Developer** role and a Play service account with only **View app
information** (details in the [main README](../../README.md#step-2--add-credentials)).

## Step 3 — The workflow

`.github/workflows/storepulse-snapshot.yml`:

```yaml
name: Refresh storepulse board

# Scheduled + manual only. NEVER add pull_request here — a workflow that
# holds store credentials must not be triggerable by fork PRs.
on:
  schedule:
    - cron: "*/30 * * * *" # every 30 minutes (UTC)
  workflow_dispatch:

# Refreshing a snapshot never needs write access to this repository.
permissions:
  contents: read

# Never let two refreshes race each other's upload.
concurrency:
  group: storepulse-snapshot
  cancel-in-progress: false

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 22
          cache: npm

      - name: Install storepulse (version pinned by the lockfile)
        run: npm ci

      - name: Assemble the static dashboard
        run: |
          mkdir -p site
          cp -R node_modules/storepulse/dist/dashboard/. site/

      - name: Generate status.json
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_PRIVATE_KEY_BASE64: ${{ secrets.ASC_PRIVATE_KEY_BASE64 }}
          PLAY_SERVICE_ACCOUNT_BASE64: ${{ secrets.PLAY_SERVICE_ACCOUNT_BASE64 }}
        run: npx storepulse snapshot --out site/status.json

      # ── Upload step: take it from your provider's guide ──────────────
      # aws.md        → configure-aws-credentials (OIDC) + aws s3 sync
      # cloudflare.md → npx wrangler pages deploy
      # vercel.md     → npx vercel deploy
      # netlify.md    → npx netlify-cli deploy
      # gcp.md        → google-github-actions/auth + gcloud app deploy
```

After the run, `site/` contains exactly what the host serves: `index.html`,
`app.js`, `style.css`, `favicon.svg`, `status.json`.

## Security notes (they apply to every provider guide)

- **Triggers are `schedule` and `workflow_dispatch` only.** Never add
  `pull_request` or `pull_request_target`: a fork could then run modified
  workflow or dependency code in a context that can reach your store
  credentials.
- **`permissions: contents: read`** is the whole grant. The workflow never
  pushes commits, so don't give it more. Provider guides that need an ID
  token add `id-token: write` explicitly — nothing else.
- **Third-party actions are pinned to a full commit SHA**, not a tag — tags
  can be moved to malicious code, commit SHAs cannot. Resolve a tag yourself
  before trusting it:

  ```sh
  gh api repos/actions/checkout/git/ref/tags/v4.4.0 --jq .object.sha
  ```

- **Pin `storepulse` itself** via `package-lock.json` + `npm ci` (done above)
  instead of `npx storepulse@latest`, so a compromised registry release can't
  silently enter the job that holds your credentials.
- **Don't debug with `set -x`** in steps that touch secrets, and never `echo`
  them. GitHub masks known secret values in logs, but derived values (like a
  decoded key) are not masked.

## Adjusting the refresh cadence

Edit the cron expression:

| Cadence | Cron |
|---|---|
| Every 15 min | `"*/15 * * * *"` |
| Every 30 min (default) | `"*/30 * * * *"` |
| Hourly | `"0 * * * *"` |
| Working hours only (09–19 KST = 00–10 UTC, Mon–Fri) | `"*/30 0-10 * * 1-5"` |

Notes:

- GitHub cron runs in **UTC**, has a 5-minute minimum interval, and is
  **best-effort** — runs are often delayed a few minutes at busy times
  ([docs](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule)).
  storepulse's own docs treat the board as "minutes fresh", not real-time.
- GitHub automatically disables scheduled workflows after ~60 days without
  repository activity (same docs page). If the deploy repo is otherwise
  dormant, expect to re-enable it from the Actions tab occasionally, or push
  a trivial commit now and then.
- Each run makes one round of App Store Connect / Play API calls per
  configured app. Both APIs are comfortable with a 15–30 minute cadence;
  going below 5 minutes buys nothing (the dashboard itself refetches every
  60 s) and only spends API quota.

## Cost overview

- Private-repo GitHub Actions minutes: a run takes ~1 minute; every 30
  minutes ≈ 1,450 minutes/month. The Free plan includes 2,000 minutes/month —
  fine at 30-minute cadence, tight at 15. Public repos have free minutes, but
  this repo should stay private.
- Everything else in this file is free.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ASC_KEY_ID is required because an ios app is configured` | Secret missing/misnamed — names must match exactly, including `_BASE64` |
| `ASC API 401` in the run | Base64 value corrupted (re-encode with `-w0` on Linux; no line wraps), or key revoked |
| `Play API 403` | Service account not invited in Play Console, or Android Developer API disabled — see [main README troubleshooting](../../README.md#troubleshooting) |
| `storepulse.config.json not found` | The config wasn't committed to the deploy repo, or the job's working directory changed |
| Workflow stopped running by itself | Scheduled workflows disabled after repo inactivity — re-enable in the Actions tab |
| Runs happen minutes late | Normal for GitHub cron; it's best-effort |
