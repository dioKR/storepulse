# AWS — private S3 + CloudFront (OAC) + Basic auth

The board lives in a **private** S3 bucket that only CloudFront can read
(origin access control). A CloudFront Function challenges every viewer for
credentials before anything is served. GitHub Actions uploads new snapshots
via OIDC — no long-lived AWS access keys anywhere.

```
GitHub Actions ──OIDC──▶ IAM role ──▶ s3://bucket (private, no public access)
                                          ▲ OAC-signed reads only
teammates ──Basic auth──▶ CloudFront ─────┘
```

Read [github-actions.md](github-actions.md) first — this page only adds the
AWS pieces.

## Prerequisites

- An AWS account and the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  configured with admin (or equivalent) rights for the one-time setup.
- Names used below — substitute your own:
  - bucket: `example-storepulse-board`
  - region: `ap-northeast-2`
  - account ID: `111122223333`
  - GitHub repo running the workflow: `your-org/storepulse-board`

## Step 1 — Private S3 bucket

```sh
aws s3api create-bucket \
  --bucket example-storepulse-board \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2
# (in us-east-1, omit --create-bucket-configuration)

aws s3api put-public-access-block \
  --bucket example-storepulse-board \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Do **not** enable S3 static website hosting — website endpoints cannot be
locked to CloudFront with OAC. CloudFront talks to the plain bucket API.

## Step 2 — CloudFront distribution with origin access control

In the [CloudFront console](https://console.aws.amazon.com/cloudfront/v4/home)
create a distribution:

1. **Origin domain**: pick the bucket (`example-storepulse-board.s3.ap-northeast-2.amazonaws.com`
   — the bucket endpoint, not a website endpoint).
2. **Origin access**: *Origin access control settings (recommended)* →
   *Create new OAC* → keep the default **Sign requests (recommended)**.
3. **Viewer protocol policy**: *Redirect HTTP to HTTPS*.
4. **Default root object**: `index.html`.
5. Leave the default cache policy (`CachingOptimized`) — it honors the
   per-object `Cache-Control` we set at upload time.

After creation, note the distribution ID (`E123EXAMPLE`) and grant that one
distribution read access to the bucket (the console offers to copy this
policy for you; this is the same policy applied via CLI):

```sh
cat > /tmp/bucket-policy.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::example-storepulse-board/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E123EXAMPLE"
        }
      }
    }
  ]
}
JSON
aws s3api put-bucket-policy \
  --bucket example-storepulse-board \
  --policy file:///tmp/bucket-policy.json
```

Full reference, including CLI-only OAC creation:
[Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

## Step 3 — Access control

The bucket is now unreachable directly, but the CloudFront URL is still
public. Add viewer auth.

### Option A — Basic auth with a CloudFront Function (simple, shared secret)

Generate the expected header value locally:

```sh
printf 'team:CHOOSE-A-LONG-PASSWORD' | base64
```

In the CloudFront console → **Functions** → *Create function* (runtime
`cloudfront-js-2.0`), paste — replacing `REPLACE_WITH_BASE64` with the output
above:

```js
function handler(event) {
  var request = event.request;
  var expected = "Basic REPLACE_WITH_BASE64";
  var auth = request.headers.authorization;
  if (auth && auth.value === expected) {
    return request;
  }
  return {
    statusCode: 401,
    statusDescription: "Unauthorized",
    headers: {
      "www-authenticate": { value: 'Basic realm="storepulse"' },
    },
  };
}
```

Use the **Test** tab, then **Publish**, then associate it with your
distribution's *Default (`*`)* behavior as a **Viewer request** function
(docs: [Customize at the edge with CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)).

Caveats you accept with Basic auth:

- One shared secret — rotate it (re-publish the function) whenever someone
  leaves the team.
- The credential rides on every request; that's fine over HTTPS, but pick a
  long random password, and never reuse a real one.

### Option B — signed cookies (per-session, more moving parts)

If a shared password is not acceptable, CloudFront signed cookies restrict
content to viewers who obtained cookies from something you trust (for
example, a tiny login page behind your company SSO). It requires a key group
and a cookie-issuing endpoint, so it is no longer "no code" — follow
[Use signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html)
if you need it. For most teams, Option A or the
[Cloudflare guide](cloudflare.md) (free per-person auth) is the better
trade-off.

## Step 4 — Uploads from GitHub Actions via OIDC (no access keys)

### 4a. Trust GitHub's OIDC issuer once per account

IAM console → **Identity providers** → *Add provider* → *OpenID Connect* →
provider URL `https://token.actions.githubusercontent.com`, audience
`sts.amazonaws.com`
([GitHub's official walkthrough](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)).

### 4b. A role only your workflow can assume

Trust policy — locked to one repo and one branch:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:your-org/storepulse-board:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Permissions policy — exactly what the upload needs, nothing more:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::example-storepulse-board"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::example-storepulse-board/*"
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::111122223333:distribution/E123EXAMPLE"
    }
  ]
}
```

```sh
aws iam create-role --role-name storepulse-board-deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json
aws iam put-role-policy --role-name storepulse-board-deploy \
  --policy-name storepulse-board-upload \
  --policy-document file:///tmp/permissions-policy.json
```

### 4c. The upload step

Append to the workflow from [github-actions.md](github-actions.md). Note the
job needs `id-token: write` in addition to `contents: read`:

```yaml
permissions:
  contents: read
  id-token: write # for OIDC — this workflow still cannot write to the repo
```

```yaml
      - uses: aws-actions/configure-aws-credentials@e6de054238d6b7531b4efff3b6587d9aade6a06c # v6.2.3
        with:
          role-to-assume: arn:aws:iam::111122223333:role/storepulse-board-deploy
          aws-region: ap-northeast-2

      - name: Upload the board
        run: |
          aws s3 sync site "s3://example-storepulse-board" --delete \
            --exclude status.json --cache-control "public, max-age=300"
          aws s3 cp site/status.json "s3://example-storepulse-board/status.json" \
            --cache-control "public, max-age=60, must-revalidate"
```

## Refresh cadence and caching

- `status.json` is uploaded with `max-age=60`, so CloudFront serves a board
  at most ~1 minute staler than the last workflow run — no invalidation
  needed for routine refreshes. Cron cadence lives in
  [github-actions.md](github-actions.md#adjusting-the-refresh-cadence).
- Force an immediate edge refresh after config or dashboard changes:

  ```sh
  aws cloudfront create-invalidation --distribution-id E123EXAMPLE --paths "/*"
  ```

  Don't put an invalidation in the scheduled workflow: at every-30-minutes
  cadence you'd exceed the 1,000 free invalidation paths per month for no
  freshness gain.

## Cost overview

For a board this size (five small files, a handful of viewers), you are deep
inside the always-free tier: CloudFront includes 1 TB egress, 10M requests,
and 2M CloudFront Function invocations per month free
([pricing](https://aws.amazon.com/cloudfront/pricing/)); S3 storage for a few
hundred KB is fractions of a cent. Expect **≈ $0–1/month**, dominated by S3
request pennies.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `403 Access Denied` from CloudFront | Bucket policy `AWS:SourceArn` doesn't match the distribution ID, or the origin isn't using the OAC ("Origin access" still *Public*) |
| `404` on `/` but `/index.html` works | **Default root object** not set to `index.html` |
| Browser loops on the password prompt | The base64 in the function doesn't match `printf 'user:pass' \| base64` (stray newline — use `printf`, not `echo`) |
| Auth prompt never appears | Function published but not associated with the behavior as *Viewer request* |
| Workflow: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` doesn't match `repo:ORG/REPO:ref:refs/heads/BRANCH` exactly (check org rename, branch) |
| Workflow: `AccessDenied` on `s3 sync` | Role permissions policy bucket name/ARN typo (`bucket` vs `bucket/*` both needed) |
| Board stale after a successful run | Cached copy within its TTL — wait out `max-age`, or run the invalidation above |
| `NoSuchBucket` on create | Bucket names are global — pick a more unique name |
