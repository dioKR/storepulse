/**
 * Shared i18n primitives — single source for the CLI, `storepulse explain`,
 * and the web dashboard (bundled at build time, see scripts/gen-dashboard-i18n.mjs).
 *
 * Design (issue #17):
 * - Badge text (LIVE/REVIEW/…) is language-invariant term identity — never translated.
 * - Only explanations, guidance and headers are localized.
 * - Explanations ship with the build, never inside status.json snapshots
 *   (data and documentation stay separate).
 */

/** Languages bundled with Storepulse's CLI and dashboard text. */
export const SUPPORTED_LANGS = ["en", "ko"] as const;

/** A language code currently supported by Storepulse text. */
export type Lang = (typeof SUPPORTED_LANGS)[number];

/** A string in every supported language. */
export type Localized = Record<Lang, string>;

/** Fallback language used when a locale cannot be recognized. */
export const DEFAULT_LANG: Lang = "en";

/**
 * Parse a language tag / POSIX locale into a supported language.
 * Accepts "ko", "ko-KR", "ko_KR.UTF-8", "en_US", … — returns null when the
 * value does not map to a supported language (e.g. "C", "ja_JP", undefined).
 * Pure — reading env vars or the OS locale is the caller's job; core never does.
 */
export function normalizeLang(value: string | undefined | null): Lang | null {
  if (!value) return null;
  const primary = value
    .trim()
    .toLowerCase()
    .split(/[-_.@]/, 1)[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(primary) ? (primary as Lang) : null;
}
