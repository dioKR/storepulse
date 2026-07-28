# Cloudflare — Pages + Cloudflare Access

The cheapest full-strength setup in this directory: Pages hosts the static
board (free, direct uploads, no build), and **Cloudflare Access** puts real
per-person authentication in front of it — free for up to 50 users. Every
teammate signs in with a one-time email PIN or your identity provider;
removing someone is deleting them from a policy, not rotating a shared
password.

Read [github-actions.md](github-actions.md) first — this page only adds the
Cloudflare pieces.

## Prerequisites

- A Cloudflare account (free plan is fine). A custom domain is optional —
  `*.pages.dev` works.
- [Zero Trust](https://one.dash.cloudflare.com/) activated on the account
  (first visit walks you through picking a team name; choose the **Free**
  plan).

## Step 1 — Create the Pages project (direct upload)

Once, from your machine:

```sh
npx wrangler login
npx wrangler pages project create storepulse-board --production-branch=main
```

The board will live at `https://storepulse-board.pages.dev`. (Direct-upload
reference: [Cloudflare docs](https://developers.cloudflare.com/pages/get-started/direct-upload/).)

Pin wrangler in the deploy repo next to storepulse, so CI never runs a
floating version:

```sh
npm install --save-dev wrangler
```

## Step 2 — CI credentials

1. **Account ID**: Cloudflare dashboard → **Workers & Pages** → right-hand
   sidebar, or the URL after `dash.cloudflare.com/`.
2. **API token**: dashboard → profile → **API Tokens** → *Create Token* →
   *Create Custom Token* with a single permission:
   **Account → Cloudflare Pages → Edit**. Scope it to the one account.

Add both as repository secrets (`CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`) — **Settings → Secrets and variables → Actions**.

## Step 3 — The upload step

Append to the workflow from [github-actions.md](github-actions.md). No extra
permissions are needed (`contents: read` stays the whole grant); wrangler
authenticates through the two environment variables:

```yaml
      - name: Deploy to Cloudflare Pages
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: npx wrangler pages deploy site --project-name=storepulse-board --branch=main
```

`--branch=main` matches the production branch, so every run replaces the
production deployment.

## Step 4 — Access control (do this before the first real deploy)

Pages sites are public by default. Two policies close everything:

1. **Preview deployments** — in the Cloudflare dashboard: **Workers &
   Pages → storepulse-board → Settings → Enable access policy**. This
   one-click toggle protects `*.storepulse-board.pages.dev` (the per-deploy
   preview URLs).
2. **The production URL** — the toggle above does *not* cover
   `storepulse-board.pages.dev` itself. In
   [Zero Trust](https://one.dash.cloudflare.com/) → **Access → Applications**,
   edit the application the toggle created and, under **Public hostname**,
   delete the wildcard (`*`) from the subdomain field and save — or add a
   second self-hosted application for the bare `storepulse-board.pages.dev`
   hostname. This exact procedure is documented under
   [Pages known issues](https://developers.cloudflare.com/pages/platform/known-issues/).
3. **Custom domain (if you attached one)** — it needs its own Access
   application too (**Access → Applications → Add an application →
   Self-hosted**, pick the domain). Without it, visitors on the custom
   domain get an Access page that cannot complete.

For each application, define who gets in — e.g. a policy with **Include →
Emails** listing teammates, or **Emails ending in → `@yourcompany.com`**. The
default login method is a one-time PIN emailed to the address; you can attach
Google/GitHub/Okta etc. as identity providers later
([Access policies](https://developers.cloudflare.com/cloudflare-one/policies/access/)).

Verify before uploading real data: open the `pages.dev` URL in a private
browser window — you must hit the Access login, not the board.

## Adjusting the refresh cadence

Nothing Cloudflare-specific: edit the cron in
[github-actions.md](github-actions.md#adjusting-the-refresh-cadence). Each
run is one more Pages deployment; direct uploads are not counted as builds,
and old deployments don't cost anything.

## Cost overview

- **Pages**: free — unlimited requests and bandwidth on static assets; the
  500 builds/month limit applies to git-integrated builds, not direct
  uploads.
- **Access**: free plan covers **up to 50 users**; beyond that it's
  pay-as-you-go per user
  ([Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/)).
- Total for a typical team: **$0/month**.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Authentication error [code: 10000]` on deploy | Token lacks **Cloudflare Pages → Edit**, or `CLOUDFLARE_ACCOUNT_ID` is wrong |
| `Project not found` | `--project-name` doesn't match Step 1, or project was created on another account |
| Board is publicly reachable at `storepulse-board.pages.dev` | Only the preview toggle was enabled — apply Step 4.2 (remove the wildcard / add the bare-hostname app) |
| Access login appears but never completes on a custom domain | Missing Access application for the custom domain (Step 4.3) |
| Teammate gets "not authorized" after signing in | Their email isn't matched by any Include rule in the policy |
| 51st user can't log in | Free plan seat limit — remove stale users in Zero Trust → My Team, or upgrade |
| Deploy succeeds but board is stale | Browser cached an old `status.json` — the dashboard refetches within 60 s; hard-reload to confirm |
