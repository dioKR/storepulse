import type { AppStatus } from "./types.js";

/**
 * Version of the snapshot document format, NOT of the package.
 * Integer, starts at 1. Bump only on breaking changes to the document
 * shape; additive optional fields do not bump it.
 * See docs/snapshot-schema.md for the format contract.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * A point-in-time export of the release board.
 * This is the single data contract between everything that produces
 * status (CLI `snapshot`/`serve`) and everything that consumes it
 * (the web dashboard, scripts, CI artifacts).
 *
 * Contains only normalized store data — never credentials or anything
 * derived from them.
 */
export interface Snapshot {
  schemaVersion: number;
  /** ISO timestamp of when this snapshot document was generated */
  generatedAt: string;
  apps: AppStatus[];
}

export function createSnapshot(apps: AppStatus[], now: Date = new Date()): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    apps,
  };
}
