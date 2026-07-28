# Google Cloud — App Engine static hosting + Identity-Aware Proxy

On Google Cloud, **Identity-Aware Proxy (IAP)** gives the board the best
access control in these guides: every viewer signs in with their Google
account, and access is a per-person IAM grant. This guide serves the static
board from **App Engine standard** (static handlers, no code) with IAP in
front, deployed from GitHub Actions via Workload Identity Federation — no
service-account keys.

> **Why not Firebase Hosting?** Firebase Hosting has no viewer-level access
> control, and IAP only fronts App Engine, Cloud Run, and load-balancer
> backend services ([IAP overview](https://docs.cloud.google.com/iap/docs/concepts-overview)) —
> it cannot be attached to Firebase Hosting or a Cloud Storage website.
> A Firebase-hosted board would be public, which this architecture forbids.
> The same goes for **Cloud Scheduler**: the refresh scheduler is GitHub
> Actions cron (see below), so no Scheduler job is needed.

Read [github-actions.md](github-actions.md) first — this page only adds the
GCP pieces.

## Prerequisites

- A Google Cloud project with billing enabled, and the
  [gcloud CLI](https://docs.cloud.google.com/sdk/docs/install) locally.
- Values used below — substitute your own:
  - project ID: `example-project` (number: `123456789012`, from
    `gcloud projects describe example-project --format='value(projectNumber)'`)
  - GitHub repo running the workflow: `your-org/storepulse-board`

Enable the required APIs once:

```sh
gcloud services enable appengine.googleapis.com cloudbuild.googleapis.com \
  iap.googleapis.com iamcredentials.googleapis.com --project example-project
```

## Step 1 — App Engine app serving the static board

Create the App Engine app (one per project, region is permanent):

```sh
gcloud app create --project example-project --region asia-northeast3
```

In the deploy repo root, add `app.yaml` — pure static handlers, no code
(pattern from [Hosting a static website on App Engine](https://docs.cloud.google.com/appengine/docs/standard/hosting-a-static-website)):

```yaml
runtime: python314
default_expiration: "10m"

handlers:
  - url: /status\.json
    static_files: site/status.json
    upload: site/status.json
    expiration: "1m" # keep the snapshot fresh between deploys
  - url: /
    static_files: site/index.html
    upload: site/index.html
  - url: /(.*)
    static_files: site/\1
    upload: site/(.*)
```

Smoke-test once from your machine (assemble `site/` the same way the
workflow does, or copy `packages/dashboard/src` plus a demo
`npx storepulse snapshot --demo --out site/status.json`):

```sh
gcloud app deploy app.yaml --project example-project --version board --quiet
gcloud app browse --project example-project
```

Pinning `--version board` makes every refresh replace the same version
instead of piling up a new one per cron run.

## Step 2 — Access control: turn on IAP

Do this **before** deploying real data — until IAP is on, the appspot URL is
public.

1. Console: **Security → Identity-Aware Proxy**
   ([guide](https://docs.cloud.google.com/iap/docs/enabling-app-engine)). If
   prompted, configure the OAuth consent screen first (for a Google
   Workspace org, choose *Internal* — only your org's accounts can ever get
   in).
2. Toggle **IAP** on for the **App Engine app** resource. From this moment
   every request must be authenticated *and* authorized.
3. Grant viewers, per person or per group:

```sh
gcloud iap web add-iam-policy-binding --project example-project \
  --resource-type=app-engine \
  --member="user:alice@example.com" \
  --role="roles/iap.httpsResourceAccessor"

# or a whole group / your Workspace domain:
#   --member="group:mobile-team@example.com"
#   --member="domain:example.com"
```

Removing someone is `gcloud iap web remove-iam-policy-binding` with the same
arguments — no shared password to rotate.

Verify: open the app URL in a private browser window — you must get the
Google sign-in, and a non-granted account must see "You don't have access".

## Step 3 — Keyless deploys from GitHub Actions (Workload Identity Federation)

### 3a. One-time IAM setup

```sh
# A pool + provider that trusts GitHub's OIDC tokens for exactly one repo
gcloud iam workload-identity-pools create github \
  --project example-project --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc storepulse-board \
  --project example-project --location global \
  --workload-identity-pool github \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository == 'your-org/storepulse-board'"

# The deploy service account, with the least roles App Engine deploys need
gcloud iam service-accounts create storepulse-deploy --project example-project

for role in roles/appengine.deployer roles/appengine.serviceAdmin \
            roles/cloudbuild.builds.editor roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding example-project \
    --member "serviceAccount:storepulse-deploy@example-project.iam.gserviceaccount.com" \
    --role "$role"
done

# Deploys impersonate the App Engine default service account
gcloud iam service-accounts add-iam-policy-binding \
  example-project@appspot.gserviceaccount.com --project example-project \
  --member "serviceAccount:storepulse-deploy@example-project.iam.gserviceaccount.com" \
  --role "roles/iam.serviceAccountUser"

# Let the GitHub workflow (and nothing else) act as that service account
gcloud iam service-accounts add-iam-policy-binding \
  storepulse-deploy@example-project.iam.gserviceaccount.com --project example-project \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/github/attribute.repository/your-org/storepulse-board"
```

(Role rationale: [App Engine deployment roles](https://docs.cloud.google.com/appengine/docs/standard/roles).)

### 3b. The upload step

Append to the workflow from [github-actions.md](github-actions.md), and add
`id-token: write` to the job permissions:

```yaml
permissions:
  contents: read
  id-token: write # for Workload Identity Federation
```

```yaml
      - uses: google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093 # v3.0.0
        with:
          project_id: example-project
          workload_identity_provider: projects/123456789012/locations/global/workloadIdentityPools/github/providers/storepulse-board
          service_account: storepulse-deploy@example-project.iam.gserviceaccount.com

      - name: Deploy the board
        run: gcloud app deploy app.yaml --quiet --version board
```

The `gcloud` CLI is preinstalled on GitHub's Ubuntu runners and picks up the
credentials the auth action exports — no keys, no extra setup.

## Adjusting the refresh cadence

Edit the cron in
[github-actions.md](github-actions.md#adjusting-the-refresh-cadence). One
GCP-specific consideration: **every refresh is an App Engine deploy**, which
runs a short Cloud Build job. At a 30-minute cadence that's ~1,500
deploys/month — harmless functionally (the `board` version is replaced in
place), but if you watch Cloud Build usage, prefer hourly or working-hours
cron. There is no need for Cloud Scheduler; if you ever want GCP-side
control of timing, have Cloud Scheduler call the workflow's
`workflow_dispatch` REST endpoint rather than moving credentials into GCP.

## Cost overview

- **IAP**: no charge.
- **App Engine standard**: static-file handlers are served by App Engine's
  front-ends without running instances, and the app has a daily free
  instance-hour quota anyway — a team-sized board rounds to **$0**
  ([quotas/pricing](https://docs.cloud.google.com/appengine/docs/standard/quotas)).
- **Cloud Build**: each deploy consumes a couple of build-minutes; at hourly
  cadence this typically stays within the free allowance — check
  [Cloud Build pricing](https://cloud.google.com/build/pricing) if you
  refresh very aggressively.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `does not contain an App Engine application` on deploy | Run `gcloud app create` once (Step 1) |
| Workflow: `PERMISSION_DENIED` on deploy | One of the four project roles missing, or the `serviceAccountUser` binding on `…@appspot.gserviceaccount.com` |
| Workflow: `Unable to acquire impersonated credentials` | `workloadIdentityUser` binding's `principalSet` doesn't match the repo exactly, or the provider's attribute condition rejects it |
| Google sign-in works, then "You don't have access" | Account lacks `roles/iap.httpsResourceAccessor` (Step 2.3) |
| Board is publicly reachable | IAP toggle is off for the App Engine resource — Step 2 was skipped |
| Everything 404s | `app.yaml` handler paths don't match the layout — `site/` must sit next to `app.yaml` |
| `status.json` stays stale for ~10 min after a deploy | Cached under `default_expiration` — keep the `expiration: "1m"` handler for `status.json` |
| Old versions piling up in the console | A deploy ran without `--version board` |
