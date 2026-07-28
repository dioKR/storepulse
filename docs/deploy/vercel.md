# Vercel — static deploys + Deployment Protection

Use this guide if your team already ships on Vercel. The board deploys as a
plain static project from the scheduled GitHub workflow, and **Deployment
Protection** with **Vercel Authentication** restricts it to your Vercel team
members.

> **Plan requirement, up front**: protecting the *production* URL ("All
> Deployments" scope) requires a **Pro or Enterprise** plan. On Hobby, the
> production domain of a project is always public — do **not** deploy a real
> board there. Details:
> [Deployment Protection docs](https://vercel.com/docs/deployment-protection).

Read [github-actions.md](github-actions.md) first — this page only adds the
Vercel pieces.

## Prerequisites

- A Vercel **team on the Pro plan** (or Enterprise), with every board viewer
  a member of the team.
- [Vercel CLI](https://vercel.com/docs/cli) locally for the one-time setup.

## Step 1 — Create and link the project

From an empty directory (or the deploy repo) on your machine:

```sh
npx vercel login
npx vercel link
```

Answer the prompts (team, new project name — e.g. `storepulse-board`).
Linking writes `.vercel/project.json`; note its `orgId` and `projectId`
([project linking docs](https://vercel.com/docs/cli/project-linking)). In the
Vercel dashboard set the project's **Framework Preset** to **Other** and
leave Build Command empty — CI uploads ready-made static files.

Pin the CLI in the deploy repo:

```sh
npm install --save-dev vercel
```

## Step 2 — CI credentials

Create a token: Vercel dashboard → account **Settings → Tokens** → create one
scoped to the team. Then add three repository secrets (**Settings → Secrets
and variables → Actions**):

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | The token you just created |
| `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

With `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` in the environment, the CLI skips
interactive linking entirely.

## Step 3 — The upload step

Append to the workflow from [github-actions.md](github-actions.md). No extra
workflow permissions are needed:

```yaml
      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: npx vercel deploy site --prod --yes --token="$VERCEL_TOKEN"
```

`vercel deploy site` uploads the assembled `site/` directory as-is; `--prod`
promotes it to the production URL.

## Step 4 — Access control (before the first real deploy)

In the Vercel dashboard: project → **Settings → Deployment Protection**:

1. Protection method: **Vercel Authentication** (included on all plans —
   viewers sign in with their Vercel account and must have access to the
   project).
2. Protection scope: **All Deployments** — this is the Pro/Enterprise-only
   setting that extends protection to the production domain. "Standard
   Protection" is *not* enough: it deliberately leaves production domains
   public.

Alternatives, for completeness:

- **Password Protection** (single shared password) is Enterprise-only, or a
  paid **Advanced Deployment Protection** add-on on Pro ($150/month) — per
  the [docs](https://vercel.com/docs/deployment-protection). For this board,
  Vercel Authentication is both stronger and cheaper.
- **Trusted IPs** is Enterprise-only.

Verify: open the production URL in a private browser window — you must land
on the Vercel sign-in wall, not the board.

### Why not a Vercel Cron Job for the snapshot?

Vercel can schedule serverless functions, but using one to regenerate
`status.json` would mean copying your App Store Connect and Play credentials
into Vercel's environment — this architecture deliberately keeps them **only
in GitHub Actions secrets**, and static deployments are immutable anyway (a
function can't overwrite a deployed file). The GitHub cron drives the
refresh; Vercel just hosts files.

## Adjusting the refresh cadence

Edit the cron in
[github-actions.md](github-actions.md#adjusting-the-refresh-cadence). Each
run creates a new production deployment; old deployments remain listed in
the dashboard (harmless, and they're protected by the same "All Deployments"
scope).

## Cost overview

- **Pro plan** (per member, see [pricing](https://vercel.com/pricing)) is the
  real cost — required for "All Deployments" protection, and every viewer
  needs a seat. Bandwidth/deployment usage for a five-file static site is
  negligible within Pro's included allowances.
- If your team isn't already on Vercel Pro, this is the most expensive option
  in these guides — compare [Cloudflare](cloudflare.md) (free) before
  committing.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| CLI asks interactive questions in CI | `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` not set (they must be set **together**), or `--yes` missing |
| `Error: The specified token is not valid` | Token expired/revoked, or created under a different account than `VERCEL_ORG_ID` |
| Production URL shows the board without login | Scope is "Standard Protection" — switch to **All Deployments** (Pro required) |
| Teammate sees "Sign in to Vercel" but then 403 | They're not a member of the Vercel team / project |
| Deployment runs a build and fails | Framework preset not **Other**, or a stray `package.json` got copied into `site/` — only the five board files belong there |
| Board renders "couldn't load status.json" | `status.json` missing from the upload — check the snapshot step ran before the deploy step |
