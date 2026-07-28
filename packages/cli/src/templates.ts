/**
 * Templates written by `storepulse init` (issue #9).
 *
 * npm/npx installs don't ship the repo's *.example.* files, so the contents
 * are embedded here as module constants. The single source of truth is still
 * the repo root (storepulse.config.example.json / .env.example) — a sync test
 * in init.test.ts fails whenever these constants drift from those files.
 */

/** Verbatim copy of storepulse.config.example.json. */
export const CONFIG_TEMPLATE = `{
  "apps": [
    {
      "key": "myapp-ios",
      "name": "MyApp",
      "group": "prod",
      "platform": "ios",
      "storeId": "1234567890"
    },
    {
      "key": "myapp-android",
      "name": "MyApp",
      "group": "prod",
      "platform": "android",
      "storeId": "com.example.myapp"
    },
    {
      "key": "myapp-dev-ios",
      "name": "MyApp Dev",
      "group": "dev",
      "platform": "ios",
      "storeId": "1234567891"
    },
    {
      "key": "myapp-dev-android",
      "name": "MyApp Dev",
      "group": "dev",
      "platform": "android",
      "storeId": "com.example.myapp.dev"
    }
  ]
}
`;

/** Verbatim copy of .env.example (keeps the least-privilege role guidance). */
export const ENV_TEMPLATE = `# ── App Store Connect ─────────────────────────────────────────────
# App Store Connect → Users and Access → Integrations → App Store Connect API
# Recommended role: "Developer" — enough for everything storepulse reads.
# "App Manager" also works, but a leaked App Manager key can submit apps and
# edit metadata, so prefer the least privilege. The .p8 below is a
# write-capable credential (up to its role) — if it ever leaks, revoke it
# immediately in App Store Connect.
ASC_KEY_ID=XXXXXXXXXX
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Either a path to the downloaded .p8 file…
ASC_PRIVATE_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
# …or its contents base64-encoded (handy for CI):
# ASC_PRIVATE_KEY_BASE64=

# ── Google Play ───────────────────────────────────────────────────
# Google Cloud service account invited in Play Console
# (Play Console → Users and permissions → invite the service account email).
# Grant ONLY "View app information" — never grant Release/publish
# permissions; storepulse doesn't need them.
PLAY_SERVICE_ACCOUNT_PATH=./service-account.json
# PLAY_SERVICE_ACCOUNT_BASE64=

# ── Expo (EAS) — optional ─────────────────────────────────────────
# Links store versions to the EAS build (commit / profile / build id) that
# produced them. Only used when an app in storepulse.config.json has an
# "easProjectId" (app.json → extra.eas.projectId).
# Access token: https://expo.dev/settings/access-tokens
# For organizations, prefer a "View Only" robot token — storepulse only
# reads builds and submissions, never triggers them.
# EAS_TOKEN=
`;

/**
 * Patterns `storepulse init` guarantees in .gitignore — everything that may
 * hold credentials or machine-local config, so they never get committed.
 */
export const GITIGNORE_ENTRIES = [
  ".env",
  "*.p8",
  "service-account*.json",
  "storepulse.config.json",
] as const;
