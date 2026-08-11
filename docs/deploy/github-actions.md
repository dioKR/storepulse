# The snapshot-refresh workflow (GitHub Actions)

Every deployment in this directory is driven by one GitHub Actions workflow:
on a schedule it generates a fresh `status.json` with your store credentials,
assembles the static dashboard, and hands the result to a provider-specific
upload step. This page defines that common workflow; each provider guide only
replaces the final step.

## Prerequisites

- A **private** GitHub repository dedicated to the board deployment. Your app
  monorepo works too, but a small separate repo keeps workflows and secrets
  scoped. The real config stays out of either repository.
- Working credentials, verified locally first (see the
  [main README](../../README.md#connect-your-real-apps)).

## Step 1 — Repository layout

```
storepulse-board/                      # private repo
├── package.json                       # pins the storepulse version
├── package-lock.json                  # lockfile → reproducible, auditable CI
├── storepulse.config.example.json     # optional shape example, no real app IDs
└── .github/workflows/
    └── storepulse-snapshot.yml        # the workflow below
```

Create the package files by pinning `storepulse` as a dev dependency:

```sh
npm init -y
npm install --save-dev storepulse
```

Keep your working `storepulse.config.json` only on your machine. It contains no
store credentials, but the app IDs and names reveal your portfolio. Make sure
the deploy repository ignores it:

```gitignore
storepulse.config.json
```

## Step 2 — Add the secrets

In the repo: **Settings → Secrets and variables → Actions → New repository
secret**. Create the config secret plus the credentials required by the
platforms in your app list:

| Secret | Value |
|---|---|
| `STOREPULSE_CONFIG_BASE64` | Your complete `storepulse.config.json`, base64-encoded |
| `ASC_KEY_ID` | The App Store Connect key ID |
| `ASC_ISSUER_ID` | The issuer ID |
| `ASC_PRIVATE_KEY_BASE64` | The `.p8` file, base64-encoded |
| `PLAY_SERVICE_ACCOUNT_BASE64` | The service-account JSON, base64-encoded |
| `EAS_TOKEN` | Optional Expo access token when any app uses `easProjectId` |

The workflow restores the config inside the ephemeral runner. storepulse reads
the credential `*_BASE64` variants directly, so no key files ever touch the
runner's checkout. Encode them locally:

```sh
# macOS
base64 -i storepulse.config.json | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
base64 -i service-account.json | pbcopy

# Linux
base64 -w0 storepulse.config.json
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

      - name: Restore app configuration
        env:
          STOREPULSE_CONFIG_BASE64: ${{ secrets.STOREPULSE_CONFIG_BASE64 }}
        run: |
          if [ -z "$STOREPULSE_CONFIG_BASE64" ]; then
            echo "::error::STOREPULSE_CONFIG_BASE64 is required"
            exit 1
          fi
          printf '%s' "$STOREPULSE_CONFIG_BASE64" | base64 --decode > storepulse.config.json

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
          EAS_TOKEN: ${{ secrets.EAS_TOKEN }}
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
- **Never commit the real `storepulse.config.json`.** It reveals the app
  portfolio even though it contains no credentials. Restore it from
  `STOREPULSE_CONFIG_BASE64` only for the duration of the CI job.
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
| `STOREPULSE_CONFIG_BASE64 is required` | The config secret is missing or misnamed |
| `storepulse.config.json` is invalid JSON | Re-encode the local config without line wrapping and replace the secret |
| Workflow stopped running by itself | Scheduled workflows disabled after repo inactivity — re-enable in the Actions tab |
| Runs happen minutes late | Normal for GitHub cron; it's best-effort |
