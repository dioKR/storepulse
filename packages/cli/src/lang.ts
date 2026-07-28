import { DEFAULT_LANG, type Lang, normalizeLang } from "@storepulse/core";

/**
 * Pull a global `--lang <value>` / `--lang=<value>` out of argv before
 * subcommand dispatch, so every command accepts it without declaring it
 * in its own parseArgs options.
 */
export function extractLangFlag(argv: string[]): { flag?: string; rest: string[] } {
  const rest: string[] = [];
  let flag: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--lang") {
      flag = argv[i + 1] ?? "";
      i++;
    } else if (arg.startsWith("--lang=")) {
      flag = arg.slice("--lang=".length);
    } else {
      rest.push(arg);
    }
  }
  return flag === undefined ? { rest } : { flag, rest };
}

/**
 * Language priority (issue #4):
 *   --lang ko|en  >  STOREPULSE_LANG  >  OS locale (LC_ALL > LC_MESSAGES > LANG)  >  en.
 * Unrecognized values (e.g. "C", "ja_JP") fall through to the next source.
 */
export function resolveLang(flag?: string, env: NodeJS.ProcessEnv = process.env): Lang {
  return (
    normalizeLang(flag) ??
    normalizeLang(env.STOREPULSE_LANG) ??
    normalizeLang(env.LC_ALL) ??
    normalizeLang(env.LC_MESSAGES) ??
    normalizeLang(env.LANG) ??
    DEFAULT_LANG
  );
}
