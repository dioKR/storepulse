import type { Lang } from "./types.js";
import { UI_STRINGS, type UiKey } from "./ui.js";

export {
  type BadgeColor,
  RELEASE_STATES,
  STATE_EXPLANATIONS,
  type StateExplanation,
} from "./states.js";
export {
  DEFAULT_LANG,
  type Lang,
  type Localized,
  normalizeLang,
  SUPPORTED_LANGS,
} from "./types.js";
export { UI_STRINGS, type UiKey } from "./ui.js";

/** Fill `{name}` placeholders. Unknown placeholders are left as-is. */
export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Look up a UI string in the given language, filling `{name}` placeholders. */
export function uiString(key: UiKey, lang: Lang, params?: Record<string, string | number>): string {
  const template = UI_STRINGS[key][lang];
  return params ? formatMessage(template, params) : template;
}
