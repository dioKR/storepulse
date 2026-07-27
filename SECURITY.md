# Security Policy

## Supported versions

storepulse is pre-1.0 and not yet published to npm. Security fixes land on
`main` only — always run the latest `main`.

| Version | Supported |
|---|---|
| latest `main` | ✅ |
| anything older | ❌ |

Once versions are published to npm, this table will list the supported
release lines.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's **private vulnerability reporting** instead:

1. Go to the repository's **Security** tab →
   [**Report a vulnerability**](https://github.com/dioKR/storepulse/security/advisories/new).
2. Describe the issue, affected code paths, and reproduction steps if you
   have them.

You should get an initial response within a few days. Please give us a
reasonable window to ship a fix before disclosing publicly.

## Scope notes — what storepulse touches

storepulse is a read-only CLI/library: it calls the App Store Connect API
and the Google Play Android Developer API and changes nothing in either
store. The security-sensitive surface is therefore **your credentials**,
not the tool's behavior:

- **App Store Connect `.p8` key** — *not* a read-only credential. It can do
  whatever its role allows (an App Manager key can submit apps and edit
  metadata). We recommend creating it with the **Developer** role, which is
  enough for everything storepulse reads.
- **Play service account JSON** — read-only *only if* you grant it only
  **View app information** in Play Console. Never grant Release/publish
  permissions.

## If a credential leaks

Act immediately — treat any exposure (committed to git, pasted in a log,
shared machine) as a compromise:

1. **Revoke first, investigate second.** Revoke the ASC key in App Store
   Connect and/or delete the service account key in Google Cloud Console.
2. Issue a replacement with the minimum role/permission.
3. Rotate every place the old secret was stored (`.env`, CI secrets,
   password managers).
4. Check both consoles for activity you don't recognize.

Step-by-step console paths and a post-incident checklist live in the
[**credential incident runbook**](docs/security/incident-runbook.md).
