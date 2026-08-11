# Cloudflare deployment starter

This directory is a copy-ready private deployment of the storepulse board:
GitHub Actions refreshes `status.json` every 30 minutes, Cloudflare Pages hosts
the static files, and Cloudflare Access controls who can view them.

> **Do not upload real store data until Access is enabled and verified.** Pages
> sites are public by default. The safe bootstrap below deploys demo data first.

The detailed provider guide remains the source of truth:
[Cloudflare — Pages + Cloudflare Access](https://github.com/dioKR/storepulse/blob/main/docs/deploy/cloudflare.md).

## 1. Copy this starter into a private repository

Copy everything in this directory, including `.github/` and `.gitignore`, into
the root of a new **private** repository. Then create your real app list:

```sh
cp storepulse.config.example.json storepulse.config.json
npm ci
```

Edit `storepulse.config.json` with your app IDs. It contains no credentials,
but it reveals your app portfolio, so `.gitignore` keeps the real file out of
Git even in a private repository. The workflow reconstructs it from a GitHub
Actions secret instead. The lockfile pins both storepulse and Wrangler for
auditable CI runs.

## 2. Create the Cloudflare Pages project

Log in once from your machine and create the project with the name expected by
the workflow:

```sh
npx wrangler login
npx wrangler pages project create storepulse-board --production-branch=main
```

If you choose a different project name or production branch, update the final
command in `.github/workflows/cloudflare.yml` to match.

## 3. Deploy demo data and protect every URL

Build a board containing sample data only, then upload it:

```sh
npm run build:demo
npx wrangler pages deploy site --project-name=storepulse-board --branch=main
```

Before adding store credentials:

1. In **Workers & Pages → storepulse-board → Settings**, enable the Access
   policy for preview deployments.
2. In **Zero Trust → Access → Applications**, also protect the bare production
   hostname `storepulse-board.pages.dev`. The preview wildcard does not cover
   it.
3. Add an Allow policy for specific teammate emails or your company email
   domain. Add a separate Access application for every custom domain.
4. Open the production URL and a preview URL in a private browser window. Both
   must show the Access login before the demo board.

Follow the
[full Access procedure](https://github.com/dioKR/storepulse/blob/main/docs/deploy/cloudflare.md#step-4--access-control-do-this-before-the-first-real-deploy)
if any URL remains public. Do not continue until both checks pass.

## 4. Add GitHub Actions secrets

Encode the app configuration without printing it or creating another file:

```sh
# macOS
base64 -i storepulse.config.json | pbcopy

# Linux
base64 -w0 storepulse.config.json
```

In **Settings → Secrets and variables → Actions**, add the encoded config and
Cloudflare upload credentials:

| Secret | Value |
|---|---|
| `STOREPULSE_CONFIG_BASE64` | Base64-encoded `storepulse.config.json` |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns `storepulse-board` |
| `CLOUDFLARE_API_TOKEN` | A custom token scoped to **Account → Cloudflare Pages → Edit** |

Add credentials only for the store platforms present in your config:

| Secret | Value |
|---|---|
| `ASC_KEY_ID` | App Store Connect key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY_BASE64` | Base64-encoded App Store Connect `.p8` key |
| `PLAY_SERVICE_ACCOUNT_BASE64` | Base64-encoded Google Play service-account JSON |

Never put store credentials in `storepulse.config.json`, and never put the real
config or any secret value in workflow YAML, commits, or logs.

## 5. Run the first real refresh

Push the starter to the private repository. In **Actions → Refresh storepulse
on Cloudflare**, choose **Run workflow**. Confirm that:

- `Generate status.json` and `Deploy to Cloudflare Pages` succeed;
- the private browser still requires Access authentication;
- the authenticated board shows your real apps and a recent collection time.

Scheduled refreshes now run every 30 minutes. Change only the cron expression
in `.github/workflows/cloudflare.yml` if you need a different cadence.

## Security invariants

- Keep only `schedule` and `workflow_dispatch` triggers. A fork PR must never
  reach store credentials.
- Keep the real `storepulse.config.json` out of Git and restore it only from
  `STOREPULSE_CONFIG_BASE64` in CI.
- Keep workflow permissions at `contents: read`.
- Keep third-party actions pinned to full commit SHAs.
- Keep the production and every preview/custom hostname behind Access.
- Rotate the Cloudflare API token and store credentials if one is exposed.
