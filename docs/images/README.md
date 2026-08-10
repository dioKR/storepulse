# docs/images

This folder holds **product screenshots only** — images of storepulse itself:

- `demo.svg` — the animated README hero. Generated: edit
  `scripts/gen-demo-svg.mjs` and re-run `node scripts/gen-demo-svg.mjs`.
- `launch-demo.gif` — a 10.3-second external-validation asset that transitions
  from the animated CLI demo to the local web dashboard. It is composed only
  from `demo.svg` and `dashboard-demo.png`, so it contains no real app data.
- `dashboard-*.png` — captures of the web dashboard.

## No store-console screenshots

Screenshots of App Store Connect, Play Console, or Google Cloud Console are
deliberately **not** kept here:

- They easily leak private data (real app names, sales, emails, IDs).
- Console UIs change often, so the images go stale quickly.

Instead, console walkthroughs in the READMEs and the site tutorial use text
menu paths plus links to the official docs:

- Apple — [Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
- Google — [Getting started with the Google Play Developer API](https://developers.google.com/android-publisher/getting_started)
