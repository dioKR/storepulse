import type { AppStatus } from "./types.js";

/**
 * A post-fetch stage that decorates statuses with extra context.
 *
 * Enrichers are deliberately NOT StoreConnectors: `fetchAll` dispatches each
 * target to the first connector that supports it, while an enricher runs
 * over the whole `fetchAll` result and adds supplementary data (e.g. which
 * EAS build produced the version a store shows). Like connectors, they are
 * constructed with their own credentials — never reading process.env or the
 * filesystem on their own.
 */
export interface Enricher {
  /** Stable identifier, e.g. "eas" */
  readonly id: string;
  /**
   * Returns the statuses with extra info attached where available.
   * Implementations must swallow their own failures per target/channel —
   * enrichment is decoration, and decoration never sinks the board.
   */
  enrich(statuses: AppStatus[]): Promise<AppStatus[]>;
}

/**
 * Run every enricher over the statuses, in order.
 * A crashing enricher is skipped wholesale (its input is passed through
 * unchanged) — mirroring fetchAll's rule that one bad credential never
 * hides the rest of the board.
 */
export async function enrichAll(
  enrichers: Enricher[],
  statuses: AppStatus[],
): Promise<AppStatus[]> {
  let current = statuses;
  for (const enricher of enrichers) {
    try {
      current = await enricher.enrich(current);
    } catch {
      // Enrichment is optional by contract — keep the un-enriched statuses.
    }
  }
  return current;
}
