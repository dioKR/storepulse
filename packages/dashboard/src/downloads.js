function safeHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Fixed testing-program link. It always serves the latest eligible build. */
export function latestTesterUrlFor(target) {
  if (target?.platform !== "android") return null;
  return safeHttpsUrl(target.latestTesterUrl);
}

/** Exact provider URL registered for this Android versionCode, or null. */
export function installUrlFor(target, entry) {
  const build = entry?.build;
  if (
    target?.platform !== "android" ||
    (typeof build !== "string" && typeof build !== "number") ||
    String(build).length === 0 ||
    typeof target.installLinks !== "object" ||
    target.installLinks === null ||
    Array.isArray(target.installLinks)
  ) {
    return null;
  }
  return safeHttpsUrl(target.installLinks[String(build)]);
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
 * One row per Android versionCode. Store releases remain visible when an
 * install artifact is not registered; only the install action is omitted.
 */
export function androidReleases(app) {
  if (app?.target?.platform !== "android") return [];

  const byBuild = new Map();
  for (const entry of app.channels ?? []) {
    if (
      (typeof entry?.build !== "string" && typeof entry?.build !== "number") ||
      String(entry.build).length === 0
    ) {
      continue;
    }

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
      target: app.target,
      installUrl: installUrlFor(app.target, entry),
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
