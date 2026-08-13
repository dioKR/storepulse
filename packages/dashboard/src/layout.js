/**
 * Pure dashboard layout helpers.
 *
 * Snapshot targets are intentionally flat. The dashboard presents them as
 * environment → app → platform, so keep that grouping policy independent from
 * DOM rendering and cover it with Node tests.
 */

export const UNGROUPED_ENVIRONMENT = "__ungrouped__";

const ENVIRONMENT_ALIASES = {
  prod: "production",
  production: "production",
  dev: "development",
  development: "development",
};

const ENVIRONMENT_LABELS = {
  production: "Production",
  development: "Development",
};

function canonicalEnvironmentId(group) {
  const normalized = group.trim();
  return ENVIRONMENT_ALIASES[normalized.toLowerCase()] ?? normalized;
}

export function environmentId(target) {
  const group = target?.group;
  if (typeof group !== "string" || group.trim() === "") return UNGROUPED_ENVIRONMENT;
  return canonicalEnvironmentId(group);
}

export function environmentLabel(id, ungroupedLabel) {
  if (id === UNGROUPED_ENVIRONMENT) return ungroupedLabel;
  const canonicalId = canonicalEnvironmentId(id);
  return ENVIRONMENT_LABELS[canonicalId] ?? canonicalId;
}

/** Remove a redundant `[group]` prefix while preserving every other name. */
export function displayAppName(target) {
  const fallback = target?.name ?? target?.key ?? "?";
  const group = target?.group;
  if (typeof group !== "string" || group === "") return fallback;

  const prefix = `[${group}]`;
  if (!fallback.toLowerCase().startsWith(prefix.toLowerCase())) return fallback;
  return fallback.slice(prefix.length).trimStart() || fallback;
}

/** Unique environment IDs in snapshot order. */
export function environmentsOf(apps) {
  const environments = [];
  for (const app of apps) {
    const id = environmentId(app.target);
    if (!environments.includes(id)) environments.push(id);
  }
  return environments;
}

/** App cards in first-seen order, with platform targets kept in snapshot order. */
export function groupAppsByName(apps) {
  const cards = [];
  const byName = new Map();
  for (const app of apps) {
    const name = displayAppName(app.target);
    let card = byName.get(name);
    if (!card) {
      card = { name, apps: [] };
      byName.set(name, card);
      cards.push(card);
    }
    card.apps.push(app);
  }
  return cards;
}
