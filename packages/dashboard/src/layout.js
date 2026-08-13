/**
 * Pure dashboard layout helpers.
 *
 * Snapshot targets are intentionally flat. The dashboard presents them as
 * group → app → platform, so keep that grouping policy independent from
 * DOM rendering and cover it with Node tests.
 */

export const UNGROUPED_GROUP = "__ungrouped__";

const GROUP_ALIASES = {
  prod: "production",
  production: "production",
  dev: "development",
  development: "development",
};

const GROUP_LABELS = {
  production: "Production",
  development: "Development",
};

function canonicalGroupId(group) {
  const normalized = group.trim();
  return GROUP_ALIASES[normalized.toLowerCase()] ?? normalized;
}

export function groupId(target) {
  const group = target?.group;
  if (typeof group !== "string" || group.trim() === "") return UNGROUPED_GROUP;
  return canonicalGroupId(group);
}

export function groupLabel(id, ungroupedLabel) {
  if (id === UNGROUPED_GROUP) return ungroupedLabel;
  const canonicalId = canonicalGroupId(id);
  return GROUP_LABELS[canonicalId] ?? canonicalId;
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

/** Unique group IDs in snapshot order. */
export function groupsOf(apps) {
  const groups = [];
  for (const app of apps) {
    const id = groupId(app.target);
    if (!groups.includes(id)) groups.push(id);
  }
  return groups;
}

/** A board with only ungrouped targets needs no top-level selector. */
export function shouldShowGroupSelector(groups) {
  return groups.length > 1 || (groups.length === 1 && groups[0] !== UNGROUPED_GROUP);
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
