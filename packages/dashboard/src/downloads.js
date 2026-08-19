/**
 * Build a safe Android install URL from an opt-in target template.
 * This is intentionally defensive: static snapshots can be hosted separately
 * from the CLI that originally validated the config.
 */
export function installUrlFor(target, entry) {
  const template = target?.installUrlTemplate;
  const storeId = target?.storeId;
  const build = entry?.build;
  if (
    target?.platform !== "android" ||
    typeof template !== "string" ||
    typeof storeId !== "string" ||
    storeId.length === 0 ||
    (typeof build !== "string" && typeof build !== "number") ||
    String(build).length === 0 ||
    !template.includes("{storeId}") ||
    !template.includes("{build}")
  ) {
    return null;
  }

  try {
    const url = new URL(
      template
        .replaceAll("{storeId}", encodeURIComponent(storeId))
        .replaceAll("{build}", encodeURIComponent(String(build))),
    );
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return url.href;
  } catch {
    return null;
  }
}

function compareBuildsDesc(left, right) {
  const digits = /^\d+$/;
  const leftNumeric = digits.test(left.build);
  const rightNumeric = digits.test(right.build);
  if (leftNumeric && rightNumeric) {
    const leftNumber = BigInt(left.build);
    const rightNumber = BigInt(right.build);
    if (leftNumber !== rightNumber) return leftNumber > rightNumber ? -1 : 1;
  } else if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return right.build.localeCompare(left.build, undefined, { numeric: true });
}

/**
 * One install row per Android versionCode. A build can move through multiple
 * Play tracks, so matching channel entries are folded into the same row.
 */
export function installableReleases(app) {
  const target = app?.target;
  const byBuild = new Map();

  for (const entry of app?.channels ?? []) {
    const installUrl = installUrlFor(target, entry);
    if (!installUrl) continue;

    const build = String(entry.build);
    const existing = byBuild.get(build);
    if (existing) {
      if (!existing.channels.includes(entry.channel)) existing.channels.push(entry.channel);
      if (!existing.releaseNotes && entry.releaseNotes) existing.releaseNotes = entry.releaseNotes;
      if (!existing.date && entry.date) existing.date = entry.date;
      if (!existing.eas && entry.eas) existing.eas = entry.eas;
      continue;
    }

    byBuild.set(build, {
      target,
      installUrl,
      build,
      version: entry.version,
      state: entry.state,
      rawState: entry.rawState,
      releaseNotes: entry.releaseNotes,
      date: entry.date,
      eas: entry.eas,
      channels: [entry.channel],
    });
  }

  return [...byBuild.values()].sort(compareBuildsDesc);
}

export function hasInstallableReleases(app) {
  return installableReleases(app).length > 0;
}
