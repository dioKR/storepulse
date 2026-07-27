/**
 * Tiny guards for parsing upstream API responses defensively.
 * The store APIs can add/remove/rename fields without notice; a missing field
 * must degrade to an "unknown" cell on the board, never crash the whole fetch.
 */

/** Returns the value if it is an array, otherwise an empty array. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Returns the value if it is a non-empty string, otherwise undefined. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Returns the value if it is a finite number, otherwise undefined. */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
