# Credential incident runbook

What to do when a storepulse credential — the App Store Connect `.p8` key or
the Google Play service account JSON — leaks or may have leaked (committed
to git, pasted into a log or chat, left on a shared machine).

**Rule of thumb: revoke first, investigate second.** Both credentials are
free to reissue; a compromised one is not free to keep alive.

---

## 1. App Store Connect API key (`.p8`)

A `.p8` key is **not** read-only. It can do whatever the role it was created
with allows — an App Manager key can submit builds for review, edit App
Store metadata, and manage TestFlight. Assume the worst while it is valid.

### Revoke the leaked key

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com) as an
   Admin (or the Account Holder).
2. Go to **Users and Access** → **Integrations** → **App Store Connect API**
   → **Team Keys**.
3. Find the key by its **Key ID** (the value of `ASC_KEY_ID`).
4. Click **Revoke** (⊖) on that row and confirm.

Revocation is immediate and permanent — every JWT signed with that key stops
working, including any legitimate CI still using it. That is the point;
don't wait for a "quiet moment".

### Reissue

1. On the same **Team Keys** page, click **＋** to generate a new key.
2. Role: **Developer** — enough for everything storepulse reads. Do not
   recreate the key with a broader role than you need.
3. Download the new `.p8` (one-time download) and note the new **Key ID**.
   The **Issuer ID** does not change.

### Update consumers

Update, in this order, so nothing keeps retrying with the dead key:

1. Local `.env`: `ASC_KEY_ID`, `ASC_PRIVATE_KEY_PATH` (or
   `ASC_PRIVATE_KEY_BASE64`).
2. CI secrets (see [section 3](#3-rotating-ci-secrets)).
3. Any other tools that shared the old key (fastlane, EAS, etc.) — and if
   the key was shared across tools, consider issuing one key per tool this
   time.

---

## 2. Google Play service account JSON

The JSON file contains a private key that authenticates as the service
account. Its blast radius is whatever the account was granted in Play
Console — if you followed the docs, that is only **View app information**
(read-only). If it ever had Release permissions, treat this as a
release-pipeline compromise, not just a data leak.

### Delete the leaked key

1. Open [Google Cloud Console](https://console.cloud.google.com) →
   **IAM & Admin** → **Service Accounts** (correct project selected).
2. Click the service account → **Keys** tab.
3. Find the key whose ID matches the `private_key_id` field inside the
   leaked JSON file.
4. **Delete** it. Deletion invalidates the key within minutes.

You normally do **not** need to delete the service account itself — deleting
the key is what kills the credential.

### Reissue

1. Same **Keys** tab → **Add key** → **Create new key** → **JSON**.
2. A new JSON file downloads. The service account email stays the same, so
   the Play Console invitation and its permissions are untouched.
3. While you are there, verify in
   [Play Console](https://play.google.com/console) → **Users and
   permissions** that the account still has **only View app information**.

### Update consumers

1. Local `.env`: `PLAY_SERVICE_ACCOUNT_PATH` (or
   `PLAY_SERVICE_ACCOUNT_BASE64`).
2. CI secrets (next section).

---

## 3. Rotating CI secrets

Order matters — rotate the store side first, then CI, so the window where a
valid secret sits in a possibly-compromised store is as short as possible:

1. **Revoke/delete the old credential** at Apple/Google (sections 1–2).
2. **Generate the replacement** there.
3. **Update the CI secret** — for GitHub Actions:
   repository **Settings** → **Secrets and variables** → **Actions** →
   update `ASC_PRIVATE_KEY_BASE64` / `PLAY_SERVICE_ACCOUNT_BASE64` (and
   `ASC_KEY_ID` if stored as a secret/variable). Base64-encode with:

   ```sh
   base64 -i AuthKey_NEWKEYID.p8 | tr -d '\n'
   base64 -i service-account.json | tr -d '\n'
   ```

4. **Re-run a pipeline** that uses the secret and confirm it passes.
5. **Purge the leak source**: rewrite git history if the file was committed
   (`git filter-repo`), delete the pasted log/message, clear shell history.
   Remember: rewriting history does *not* un-leak the old key — that's why
   revocation came first.

---

## 4. Post-incident checklist

- [ ] Old ASC key shows as **Revoked** in App Store Connect → Integrations.
- [ ] Old service account key no longer listed in Cloud Console → Keys.
- [ ] `pnpm status` works locally with the new credentials.
- [ ] CI run using the new secrets is green.
- [ ] No unrecognized activity: App Store Connect (app versions, users,
      recently submitted builds) and Play Console (release history, user
      list) reviewed.
- [ ] Cloud audit logs checked for unfamiliar service-account usage
      (Cloud Console → Logging, filter by the service account principal).
- [ ] New ASC key role is **Developer**; Play permission is still only
      **View app information**.
- [ ] Leak source removed (git history rewritten / log deleted) and the
      route that caused the leak closed (e.g. `.p8` now only in a password
      manager and CI secrets, never in the repo directory of another
      project).
- [ ] If others use this repo's credentials: they've been told, and got the
      new secrets over a private channel.
