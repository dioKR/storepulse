/**
 * storepulse dashboard — version propagation math (issue #32).
 *
 * Pure snapshot arithmetic, no DOM: which bundle is the newest an app has
 * submitted to ANY channel, and is each channel on it? Kept out of app.js so
 * vitest can exercise it from Node (packages/core/src/dashboard-propagation.test.ts),
 * the same way the i18n bundle is pinned from core.
 *
 * "semver-ish": versions compare segment by segment ("2.10.0" > "2.9.9"),
 * numerically when both segments are plain numbers, as strings otherwise.
 * Builds only break version ties, and a missing build never disqualifies a
 * match — an iOS production draft can lack an attached build, so that entry
 * is judged by version alone.
 *
 * Platform rule: on Android the `version` field may hold an arbitrary custom
 * Play release name, while `build` (versionCode) is monotonic per app — so
 * Android entries order and match by build first, version only as fallback.
 * iOS is the opposite (build numbers may restart per version) and keeps the
 * version-first ordering above.
 */

const NUM_RE = /^\d+$/;

/** Semver-ish version compare → -1 / 0 / 1. Missing segments rank lower ("1.2" < "1.2.1"). */
export function compareVersions(a, b) {
  const as = String(a).split(".");
  const bs = String(b).split(".");
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i += 1) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (NUM_RE.test(x) && NUM_RE.test(y)) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      // numerically equal ("01" vs "1") — keep scanning the next segments
    } else {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Build-number compare → -1 / 0 / 1. Same segment-wise numeric rules as
 * compareVersions: plain numerics compare numerically ("9" < "108") and
 * dotted iOS CFBundleVersion values compare per segment
 * ("1.0.0.9" < "1.0.0.10"), never lexicographically.
 */
export function compareBuilds(a, b) {
  return compareVersions(a, b);
}

function hasVersion(entry) {
  return typeof entry.version === "string" && entry.version !== "";
}

/**
 * Order two channel entries as "latest bundle" candidates.
 * iOS (default): version first, then build. On a version tie an entry WITH a
 * build outranks a build-less one, so the Latest summary can show a build
 * number when any channel provides it.
 * Android: build (versionCode, monotonic) first — custom Play release names
 * make the version field lexicographically meaningless there.
 */
function compareEntries(a, b, platform) {
  if (platform === "android") {
    const androidA = a.build ?? null;
    const androidB = b.build ?? null;
    if (androidA !== null && androidB !== null) {
      const byBuild = compareBuilds(androidA, androidB);
      if (byBuild !== 0) return byBuild;
      return compareVersions(a.version, b.version);
    }
    // one side has no versionCode (defensive) — fall through to version-first
  }
  const byVersion = compareVersions(a.version, b.version);
  if (byVersion !== 0) return byVersion;
  const ab = a.build ?? null;
  const bb = b.build ?? null;
  if (ab === null && bb === null) return 0;
  if (ab === null) return -1;
  if (bb === null) return 1;
  return compareBuilds(ab, bb);
}

/**
 * The newest bundle this app has in ANY channel — `{ version, build }` with
 * `build: null` when the winning entry has none — or null when no entry has a
 * version (version-less entries cannot be compared, so they are skipped).
 */
export function latestBundle(entries, platform) {
  let best = null;
  for (const entry of entries ?? []) {
    if (!hasVersion(entry)) continue;
    if (best === null || compareEntries(entry, best, platform) > 0) best = entry;
  }
  return best === null ? null : { version: best.version, build: best.build ?? null };
}

/** "2.5.0 (108)" when the bundle has a build number, "2.5.0" otherwise. */
export function formatBundle(bundle) {
  return bundle.build ? `${bundle.version} (${bundle.build})` : bundle.version;
}

/**
 * Does this entry count as the latest bundle? Same version, and same build
 * when BOTH sides have one — a production entry without an attached build
 * matches on version alone (the issue-#32 caveat).
 */
function isLatest(entry, latest, platform) {
  const eb = entry.build ?? null;
  const lb = latest.build ?? null;
  // Android: versionCode equality IS identity — the version field may be a
  // custom release name that differs between channels for the same binary.
  if (platform === "android" && eb !== null && lb !== null) {
    return compareBuilds(eb, lb) === 0;
  }
  if (compareVersions(entry.version, latest.version) !== 0) return false;
  return eb === null || lb === null || compareBuilds(eb, lb) === 0;
}

/**
 * Propagation state of one channel against the app's latest bundle:
 *  - null — nothing comparable here (no entries, or none with a version);
 *    the cell keeps its existing "—" / raw rendering, no mark
 *  - { status: "latest" } — some entry IS the latest bundle → green ✓
 *  - { status: "behind", version, build } — every entry is older → amber ▲;
 *    version/build describe the channel's own newest entry
 */
export function channelPropagation(entries, latest, platform) {
  if (!latest) return null;
  let best = null;
  for (const entry of entries ?? []) {
    if (!hasVersion(entry)) continue;
    if (isLatest(entry, latest, platform)) return { status: "latest" };
    if (best === null || compareEntries(entry, best, platform) > 0) best = entry;
  }
  if (best === null) return null;
  return { status: "behind", version: best.version, build: best.build ?? null };
}
