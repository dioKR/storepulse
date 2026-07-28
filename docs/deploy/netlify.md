# Netlify — static deploys + password protection

Use this guide if your team already lives on Netlify. The scheduled GitHub
workflow pushes the board with the Netlify CLI, and Netlify's site-wide
**password protection** keeps it off the open internet.

> **Plan requirement, up front**: site-wide password protection needs a
> **Pro** plan; on the free tier a Netlify site is always public — do **not**
> deploy a real board there. Per-person **team login** protection (instead of
> a shared password) is Enterprise-only
> ([docs](https://docs.netlify.com/manage/security/secure-access-to-sites/password-protection/)).

Read [github-actions.md](github-actions.md) first — this page only adds the
Netlify pieces.

## Prerequisites

- A Netlify team on the **Pro** plan (or Enterprise).
- [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)
  locally for the one-time setup.

## Step 1 — Create the site

```sh
npx netlify-cli login
npx netlify-cli sites:create --name storepulse-board
```

(Or in the dashboard: **Add new project → Deploy manually** and drop any
placeholder folder.) The board will live at
`https://storepulse-board.netlify.app`.

Copy the **Project ID** (a.k.a. Site ID): dashboard → project →
**Project configuration → General → Project information**.

Pin the CLI in the deploy repo:

```sh
npm install --save-dev netlify-cli
```

## Step 2 — CI credentials

1. Personal access token: Netlify dashboard → user avatar → **User settings →
   Applications → Personal access tokens → New access token**. Set an
   expiration and store it immediately (it is shown once).
2. Add two repository secrets (**Settings → Secrets and variables →
   Actions**):

| Secret | Value |
|---|---|
| `NETLIFY_AUTH_TOKEN` | The personal access token |
| `NETLIFY_SITE_ID` | The Project ID from Step 1 |

The CLI picks both up from the environment — no `netlify link` needed in CI.

## Step 3 — The upload step

Append to the workflow from [github-actions.md](github-actions.md). No extra
workflow permissions are needed:

```yaml
      - name: Deploy to Netlify
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
        run: npx netlify-cli deploy --prod --dir=site
```

## Step 4 — Access control (before the first real deploy)

Dashboard → project → **Project configuration → Access & security → Visitor
access → Password protection**:

1. Choose **Protect all deploys** — production, Deploy Previews, and branch
   deploys all sit behind the password. ("Non-production deploys only" exists
   but leaves production open; that scope is also Enterprise-only.)
2. Set a long random password and share it with the team through your
   password manager.

Notes and alternatives:

- A site password is **one shared secret**: rotate it whenever someone leaves
  the team. If you want per-person auth on Netlify you need Enterprise
  ("team login"), or pick [Cloudflare](cloudflare.md) — per-person and free.
- Pro also supports [basic authentication via custom headers](https://docs.netlify.com/manage/security/secure-access-to-sites/basic-authentication-with-custom-http-headers/)
  (a `_headers` file with `Basic-Auth`), useful if you want several
  user/password pairs. Remember the `_headers` file would need to be added to
  `site/` in the workflow before deploying.

Verify: open `https://storepulse-board.netlify.app` in a private browser
window — you must see the password prompt, not the board.

### Why not a Netlify Scheduled Function for the snapshot?

Netlify can run scheduled functions, but regenerating `status.json` there
would require your App Store Connect and Play credentials to live in
Netlify's environment — this architecture deliberately keeps them **only in
GitHub Actions secrets**, and a function can't rewrite the files of an
already-published static deploy anyway. The GitHub cron drives the refresh;
Netlify just hosts files.

## Adjusting the refresh cadence

Edit the cron in
[github-actions.md](github-actions.md#adjusting-the-refresh-cadence). Each
run publishes a new production deploy; Netlify keeps the old ones listed for
instant rollback, which is harmless here.

## Cost overview

- **Pro plan** (per member, see [pricing](https://www.netlify.com/pricing/))
  is the real cost, since password protection requires it. The site itself —
  five small files, team-sized traffic — is nowhere near Pro's bandwidth
  allowances.
- Frequent deploys are fine: CLI deploys of a prebuilt folder don't consume
  build minutes.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| CLI prompts "Link this directory to a site" in CI | `NETLIFY_SITE_ID` not set or misspelled |
| `Error: Not authorized` on deploy | `NETLIFY_AUTH_TOKEN` expired/revoked (tokens also die if the account password is reset) |
| Site is publicly visible | Password protection not enabled, or scope set to non-production deploys only |
| Password prompt accepts but board 404s | Deploy published a wrong directory — `--dir=site` must point at the folder holding `index.html` |
| A former teammate still gets in | Shared password not rotated — change it in the same settings screen |
| Board renders "couldn't load status.json" | Snapshot step failed or ran after the deploy step — check workflow step order |
