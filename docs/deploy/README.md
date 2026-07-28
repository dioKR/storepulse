# Deploying the storepulse board for your team

`storepulse serve` is great on your own machine, but sooner or later the whole
team wants the board in a browser tab. These guides show how to host it — on
purpose-built, boring infrastructure — without ever standing up a server of
your own.

## The architecture (same for every provider)

Every guide in this directory implements the same three-part design:

```
┌──────────────────────┐        ┌─────────────────────────┐
│  App Store Connect   │        │  GitHub Actions (cron)  │
│  Google Play API     │ ─────▶ │  npx storepulse snapshot│
└──────────────────────┘        │  secrets live ONLY here │
                                └───────────┬─────────────┘
                                            │ uploads dashboard files
                                            │ + fresh status.json
                                            ▼
                        ┌───────────────────────────────────┐
                        │  Static hosting (private)         │
                        │  index.html · app.js · style.css  │
                        │  favicon.svg · status.json        │
                        └───────────┬───────────────────────┘
                                    │ access-controlled HTTPS
                                    ▼
                              your teammates
```

1. **Static hosting.** The dashboard is four plain files shipped inside the
   [`storepulse` npm package](https://www.npmjs.com/package/storepulse)
   (`dist/dashboard/`). Put them on any static host together with a
   `status.json` (format: [snapshot schema](../snapshot-schema.md)) and the
   board renders — the page re-fetches `status.json` every 60 seconds.
2. **A CI scheduler refreshes the snapshot.** A GitHub Actions workflow runs
   on a cron, calls `npx storepulse snapshot --out status.json` with your
   store credentials, and uploads the result. The shared workflow lives in
   [**github-actions.md**](github-actions.md) — read it first, every provider
   guide builds on it.
3. **Access control in front.** `status.json` contains internal information:
   unreleased version numbers, review rejections, and your full app
   portfolio. Every guide therefore puts an authentication layer in front of
   the site. **Never deploy the board to a public bucket or site.**

Three invariants, no exceptions:

- **No server of yours.** Only managed static hosting and managed auth.
- **Credentials exist only as CI secrets** (`ASC_KEY_ID`, `ASC_ISSUER_ID`,
  `ASC_PRIVATE_KEY_BASE64`, `PLAY_SERVICE_ACCOUNT_BASE64`). They are never
  uploaded to the hosting provider and never written into the site.
- **The board is never public.** If a provider cannot protect the production
  URL on your plan, the guide says so — pick another provider rather than
  shipping the board open.

## Which provider?

| Guide | Access control | Cost for a small team | Pick it when |
|---|---|---|---|
| [Cloudflare](cloudflare.md) | Cloudflare Access — SSO / email one-time PIN, per-person | **Free** (Pages free tier + Access free for up to 50 users) | You want the cheapest solid default, or already use Cloudflare |
| [AWS](aws.md) | CloudFront Functions Basic auth, or signed cookies | Cents/month (S3 + CloudFront free-tier territory) | Your infra is already on AWS and you want full control (OIDC, IaC) |
| [Google Cloud](gcp.md) | Identity-Aware Proxy — Google accounts, per-person | ≈ Free (App Engine free daily quota; IAP has no charge) | Your team lives in Google Workspace |
| [Vercel](vercel.md) | Vercel Authentication (team members only) | Pro plan required to protect the production URL | Your apps already deploy on a Vercel Pro team |
| [Netlify](netlify.md) | Site-wide password (shared secret) | Pro plan required for password protection | Your team already pays for Netlify |

Rules of thumb:

- **No existing stack, small team, $0 budget** → Cloudflare. Free tier covers
  50 users and Access gives real per-person auth (revoke one teammate without
  rotating a shared password).
- **Per-person auth beats a shared password** — Cloudflare Access and Google
  IAP identify each viewer; Basic auth and Netlify passwords are one shared
  secret you must rotate when someone leaves.
- **Already paying for a platform** → stay on it. The workflow only differs by
  one upload step.
- **GitHub Pages is not on the list on purpose**: it cannot restrict viewers
  outside of GitHub Enterprise Cloud, so it would make your release board
  public.

## What you need before any guide

- Your apps listed in `storepulse.config.json` and working store credentials —
  set up in the [main README](../../README.md#connect-your-real-apps). Run
  `pnpm status` (or `npx storepulse`) locally first; deploy only after the
  board renders your real data.
- A **private** GitHub repository to hold the workflow and config (the config
  file alone reveals your app portfolio).
- The shared snapshot workflow from [github-actions.md](github-actions.md).

## Guides

1. [github-actions.md](github-actions.md) — the common snapshot-refresh
   workflow (start here)
2. [aws.md](aws.md) — S3 (private) + CloudFront with OAC + Basic auth, OIDC
   uploads
3. [cloudflare.md](cloudflare.md) — Pages + Cloudflare Access
4. [vercel.md](vercel.md) — Vercel + Deployment Protection
5. [netlify.md](netlify.md) — Netlify + password protection
6. [gcp.md](gcp.md) — App Engine + Identity-Aware Proxy
