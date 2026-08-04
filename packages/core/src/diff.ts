import type { Snapshot } from "./snapshot.js";
import type { AppStatus, AppTarget, ChannelStatus, EasBuildInfo } from "./types.js";

export type SnapshotChangeKind = "added" | "removed" | "changed";

export interface ChannelStatusChange {
  kind: SnapshotChangeKind;
  before?: ChannelStatus;
  after?: ChannelStatus;
}

export interface AppStatusChange {
  kind: SnapshotChangeKind;
  key: string;
  before?: AppStatus;
  after?: AppStatus;
  targetChanged: boolean;
  errorChanged: boolean;
  channels: ChannelStatusChange[];
}

export interface SnapshotDiff {
  beforeGeneratedAt: string;
  afterGeneratedAt: string;
  apps: AppStatusChange[];
}

/**
 * Compare two snapshot documents while ignoring collection timestamps.
 * Apps are matched by `target.key`; channel entries are matched by their
 * stable release identity (`channel` + `version` + `build`).
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const beforeApps = new Map(before.apps.map((app) => [app.target.key, app]));
  const afterApps = new Map(after.apps.map((app) => [app.target.key, app]));
  const keys = [...afterApps.keys(), ...beforeApps.keys()].filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const apps: AppStatusChange[] = [];

  for (const key of keys) {
    const previous = beforeApps.get(key);
    const current = afterApps.get(key);
    if (!previous && current) {
      apps.push({
        kind: "added",
        key,
        after: current,
        targetChanged: false,
        errorChanged: false,
        channels: current.channels.map((afterChannel) => ({
          kind: "added",
          after: afterChannel,
        })),
      });
      continue;
    }
    if (previous && !current) {
      apps.push({
        kind: "removed",
        key,
        before: previous,
        targetChanged: false,
        errorChanged: false,
        channels: previous.channels.map((beforeChannel) => ({
          kind: "removed",
          before: beforeChannel,
        })),
      });
      continue;
    }
    if (!previous || !current) continue;

    const targetChanged = !sameTarget(previous.target, current.target);
    const errorChanged = (previous.error ?? null) !== (current.error ?? null);
    const channels = diffChannels(previous.channels, current.channels);
    if (targetChanged || errorChanged || channels.length > 0) {
      apps.push({
        kind: "changed",
        key,
        before: previous,
        after: current,
        targetChanged,
        errorChanged,
        channels,
      });
    }
  }

  return {
    beforeGeneratedAt: before.generatedAt,
    afterGeneratedAt: after.generatedAt,
    apps,
  };
}

function diffChannels(before: ChannelStatus[], after: ChannelStatus[]): ChannelStatusChange[] {
  const beforeGroups = groupChannels(before);
  const afterGroups = groupChannels(after);
  const identities = [...afterGroups.keys(), ...beforeGroups.keys()].filter(
    (identity, index, all) => all.indexOf(identity) === index,
  );
  const changes: ChannelStatusChange[] = [];

  for (const identity of identities) {
    const previous = beforeGroups.get(identity) ?? [];
    const current = afterGroups.get(identity) ?? [];
    const count = Math.max(previous.length, current.length);
    for (let index = 0; index < count; index++) {
      const beforeChannel = previous[index];
      const afterChannel = current[index];
      if (!beforeChannel && afterChannel) {
        changes.push({ kind: "added", after: afterChannel });
      } else if (beforeChannel && !afterChannel) {
        changes.push({ kind: "removed", before: beforeChannel });
      } else if (beforeChannel && afterChannel && !sameChannel(beforeChannel, afterChannel)) {
        changes.push({ kind: "changed", before: beforeChannel, after: afterChannel });
      }
    }
  }

  return changes;
}

function groupChannels(channels: ChannelStatus[]): Map<string, ChannelStatus[]> {
  const groups = new Map<string, ChannelStatus[]>();
  for (const channel of channels) {
    const identity = JSON.stringify([
      channel.channel,
      channel.version ?? null,
      channel.build ?? null,
    ]);
    const entries = groups.get(identity) ?? [];
    entries.push(channel);
    groups.set(identity, entries);
  }
  return groups;
}

function sameTarget(before: AppTarget, after: AppTarget): boolean {
  return (
    before.key === after.key &&
    before.name === after.name &&
    before.platform === after.platform &&
    before.storeId === after.storeId &&
    (before.group ?? null) === (after.group ?? null) &&
    (before.easProjectId ?? null) === (after.easProjectId ?? null) &&
    (before.easAppIdentifier ?? null) === (after.easAppIdentifier ?? null)
  );
}

function sameChannel(before: ChannelStatus, after: ChannelStatus): boolean {
  return (
    before.channel === after.channel &&
    before.version === after.version &&
    (before.build ?? null) === (after.build ?? null) &&
    before.state === after.state &&
    (before.rawState ?? null) === (after.rawState ?? null) &&
    (before.rolloutPercent ?? null) === (after.rolloutPercent ?? null) &&
    (before.releaseNotes ?? null) === (after.releaseNotes ?? null) &&
    (before.date ?? null) === (after.date ?? null) &&
    (before.expiresAt ?? null) === (after.expiresAt ?? null) &&
    sameEas(before.eas, after.eas)
  );
}

function sameEas(before: EasBuildInfo | undefined, after: EasBuildInfo | undefined): boolean {
  if (!before || !after) return before === after;
  return (
    (before.profile ?? null) === (after.profile ?? null) &&
    (before.commit ?? null) === (after.commit ?? null) &&
    (before.buildId ?? null) === (after.buildId ?? null) &&
    (before.completedAt ?? null) === (after.completedAt ?? null) &&
    (before.submissionStatus ?? null) === (after.submissionStatus ?? null)
  );
}
