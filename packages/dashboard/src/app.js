/**
 * storepulse dashboard — renders one status.json snapshot as the release board.
 *
 * Single data source, both modes:
 *  - `storepulse serve` answers ./status.json (and /api/status) with live data
 *  - static deploys put a `storepulse snapshot --out status.json` file next to index.html
 * Same build artifact either way; there is no mode detection.
 *
 * i18n (issue #17): ./i18n.js is generated from packages/core/src/i18n/ at
 * build time — explanations ship with the bundle, never inside status.json.
 * Badge text stays language-invariant; only prose is translated.
 *
 * All data is inserted via textContent — snapshot strings never become markup.
 */

import { STATE_EXPLANATIONS, SUPPORTED_LANGS, UI_STRINGS } from "./i18n.js";
import { channelPropagation, formatBundle, latestBundle } from "./propagation.js";

const DATA_URL = "./status.json";
const REFRESH_MS = 60_000;
const SUPPORTED_SCHEMA_VERSION = 1;
const LANG_STORAGE_KEY = "storepulse-lang";

// Channel names are terms — English in every language, like the CLI columns.
const CHANNELS = [
  { id: "production", label: "Production" },
  { id: "beta", label: "Beta / TestFlight" },
  { id: "internal", label: "Internal" },
];

/** TestFlight builds expiring in ≤ this many days get a warning color. */
const EXPIRY_WARN_DAYS = 7;
const DAY_MS = 86_400_000;

const boardEl = document.getElementById("board");
const filtersEl = document.getElementById("filters");
const metaEl = document.getElementById("meta");
const footEl = document.getElementById("foot");
const langSwitchEl = document.getElementById("lang-switch");
const explainEl = document.getElementById("explain");

// UI state that must survive the 60s auto-refresh re-render.
const expandedKeys = new Set();
let osFilter = "all";
let groupFilter = "all";
let lastSnapshot = null;
let lastError = null;

/* ── i18n ────────────────────────────────── */

function initialLang() {
  // localStorage remembers the choice; browser language is the default.
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (SUPPORTED_LANGS.includes(stored)) return stored;
  } catch {
    // storage may be unavailable (private mode) — fall through to the browser language
  }
  const primary = String(navigator.language || "en")
    .toLowerCase()
    .split(/[-_]/)[0];
  return SUPPORTED_LANGS.includes(primary) ? primary : "en";
}

let lang = initialLang();

/** UI string in the current language, with `{name}` placeholders filled. */
function t(key, params) {
  const entry = UI_STRINGS[key];
  const template = entry ? (entry[lang] ?? entry.en) : key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

/** Pick the current language out of a {en, ko} dictionary value. */
function loc(localized) {
  return localized[lang] ?? localized.en;
}

function setLang(next) {
  if (next === lang || !SUPPORTED_LANGS.includes(next)) return;
  lang = next;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // storage unavailable — the choice just won't survive a reload
  }
  document.documentElement.lang = next;
  renderLangSwitch();
  if (openExplainState) renderExplainPanel();
  if (lastSnapshot) render(lastSnapshot);
  else if (lastError) renderLoadError(lastError);
}

function renderLangSwitch() {
  langSwitchEl.setAttribute("role", "group");
  langSwitchEl.setAttribute("aria-label", t("dash.langLabel"));
  langSwitchEl.replaceChildren();
  for (const l of SUPPORTED_LANGS) {
    const btn = chip(l.toUpperCase(), lang === l, () => setLang(l));
    langSwitchEl.append(btn);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ── state badges (click = term explanation) ─ */

/**
 * The badge itself is a button: clicking it opens the glossary panel for that
 * state, while clicking anywhere else on the row toggles the detail panel —
 * two separate flows, so the badge click must not bubble into the row.
 */
function badgeButton(stateId, text) {
  const btn = el("button", `badge badge-btn st-${stateId}`, text);
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute(
    "aria-label",
    t("dash.explainBadge", { badge: STATE_EXPLANATIONS[stateId].badge }),
  );
  btn.addEventListener("click", (event) => {
    event.stopPropagation(); // keep the row's detail toggle out of this
    openExplain(stateId);
  });
  return btn;
}

/** One "2.4.1 LIVE (108)" cluster, colored like the CLI board. */
function badge(entry) {
  const frag = document.createDocumentFragment();
  frag.append(`${entry.version ?? "?"} `);

  if (entry.state === "rollout") {
    frag.append(badgeButton("rollout", `${entry.rolloutPercent ?? "?"}%`));
  } else if (Object.hasOwn(STATE_EXPLANATIONS, entry.state) && entry.state !== "unknown") {
    frag.append(badgeButton(entry.state, STATE_EXPLANATIONS[entry.state].badge));
  } else {
    // Unmapped store state (upstream API change?) — gray UNKNOWN + raw state.
    frag.append(badgeButton("unknown", "UNKNOWN"));
    if (entry.rawState) frag.append(" ", el("span", "dim", `(${entry.rawState})`));
  }

  if (entry.build) frag.append(" ", el("span", "dim", `(${entry.build})`));
  return frag;
}

/**
 * Propagation mark for a channel cell (issue #32): green ✓ when the channel
 * carries the app's latest bundle, amber ▲ when its newest entry is older.
 * The badges next to it already show the versions, so the mark stays a small
 * symbol; the precise "newest here vs latest" reading lives in the tooltip.
 */
function propMark(prop, latest) {
  const onLatest = prop.status === "latest";
  const mark = el("span", onLatest ? "prop prop-ok" : "prop prop-behind", onLatest ? "✓" : "▲");
  const label = onLatest
    ? t("dash.propLatest", { latest: formatBundle(latest) })
    : t("dash.propBehind", { current: formatBundle(prop), latest: formatBundle(latest) });
  mark.title = label;
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", label);
  return mark;
}

function channelCell(app, channelId, latest) {
  const td = el("td");
  const entries = (app.channels ?? []).filter((c) => c.channel === channelId);
  if (entries.length === 0) {
    td.append(el("span", "dim", "—"));
    return td;
  }
  const prop = channelPropagation(entries, latest);
  if (prop) td.append(propMark(prop, latest), " ");
  entries.forEach((entry, i) => {
    if (i > 0) td.append(el("span", "dim", "  ·  "));
    td.append(badge(entry));
  });
  return td;
}

function appCell(target, showName, latest) {
  const td = el("td", "app");
  if (showName) {
    td.append(target.name ?? target.key ?? "?");
    if (target.group) td.append(" ", el("span", "group", `[${target.group}]`));
  }
  // Per-target summary on every row — Aurora iOS and Aurora Android share a
  // name cell but each has its own latest bundle (issue #32).
  if (latest) {
    td.append(el("div", "latest", t("dash.latest", { bundle: formatBundle(latest) })));
  }
  return td;
}

/* ── explanation overlay (badge glossary) ── */

let openExplainState = null;
let explainReturnFocus = null;

function openExplain(stateId) {
  openExplainState = stateId;
  explainReturnFocus = document.activeElement;
  renderExplainPanel();
  explainEl.hidden = false;
  explainEl.querySelector(".explain-close")?.focus();
}

function closeExplain() {
  if (openExplainState === null) return;
  openExplainState = null;
  explainEl.hidden = true;
  explainEl.replaceChildren();
  if (explainReturnFocus?.isConnected) explainReturnFocus.focus();
  explainReturnFocus = null;
}

function explainSection(panel, titleText, ...children) {
  panel.append(el("div", "explain-section", titleText), ...children);
}

function renderExplainPanel() {
  const stateId = openExplainState;
  const info = STATE_EXPLANATIONS[stateId];
  explainEl.replaceChildren();

  const backdrop = el("div", "explain-backdrop");
  backdrop.addEventListener("click", closeExplain);

  const panel = el("div", "explain-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "explain-title");

  const head = el("div", "explain-head");
  const title = el("h2", "explain-title");
  title.id = "explain-title";
  title.append(el("span", `badge st-${stateId}`, info.badge), " ", el("span", "dim", stateId));
  const close = el("button", "explain-close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", t("dash.explainClose"));
  close.addEventListener("click", closeExplain);
  head.append(title, close);
  panel.append(head);

  explainSection(
    panel,
    t("explain.meaning"),
    el("p", "explain-summary", loc(info.summary)),
    el("p", "explain-detail", loc(info.detail)),
  );

  const dl = el("dl", "kv");
  kvPair(dl, "iOS", info.rawStates.ios.length > 0 ? info.rawStates.ios.join(", ") : "—");
  kvPair(
    dl,
    "Android",
    info.rawStates.android.length > 0 ? info.rawStates.android.join(", ") : "—",
  );
  explainSection(panel, t("explain.rawStates"), dl);

  explainSection(panel, t("explain.action"), el("p", "explain-action", loc(info.action)));

  explainEl.append(backdrop, panel);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeExplain();
});

/* ── detail panel ────────────────────────── */

function localDateTime(iso) {
  const time = Date.parse(iso);
  // Unparseable date from upstream — show it verbatim rather than hiding it.
  return Number.isNaN(time) ? iso : new Date(time).toLocaleString();
}

/** D-day text + warning class for a TestFlight expirationDate. */
function expiryInfo(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return { text: iso, cls: "" };
  const days = Math.ceil((time - Date.now()) / DAY_MS);
  const local = new Date(time).toLocaleDateString();
  if (days < 0) return { text: t("dash.expired", { date: local }), cls: "exp-over" };
  const label = days === 0 ? "D-day" : `D-${days}`;
  return { text: `${label} (${local})`, cls: days <= EXPIRY_WARN_DAYS ? "exp-soon" : "" };
}

function kvPair(dl, label, value, valueClass) {
  dl.append(el("dt", null, label), el("dd", valueClass || null, value));
}

/** "8c1f37ab90d2…" → "8c1f37a" — enough to paste into `git show`. */
function shortCommit(hash) {
  return hash.length > 7 ? hash.slice(0, 7) : hash;
}

/**
 * EAS build block — only when the snapshot has `eas` on this entry
 * (EasEnricher matched a build, or demo fixtures). Answers "which
 * commit/profile/build is this store version?" right in the detail panel.
 */
function easBlock(eas) {
  const box = el("div", "eas");
  box.append(el("div", "eas-title", t("dash.easTitle")));
  const dl = el("dl", "kv");
  if (eas.profile) kvPair(dl, t("dash.kvEasProfile"), eas.profile);
  if (eas.commit) {
    kvPair(dl, t("dash.kvEasCommit"), shortCommit(eas.commit));
    dl.lastChild.title = eas.commit; // full hash on hover, still textContent-only
  }
  if (eas.completedAt) kvPair(dl, t("dash.kvEasCompleted"), localDateTime(eas.completedAt));
  if (eas.submissionStatus) kvPair(dl, t("dash.kvEasSubmission"), eas.submissionStatus);
  box.append(dl);
  return box;
}

function detailEntry(entry, channelLabel) {
  const box = el("div", "detail-entry");

  const head = el("div", "detail-entry-head");
  head.append(el("span", "detail-channel", channelLabel), " ", badge(entry));
  box.append(head);

  const dl = el("dl", "kv");
  kvPair(dl, t("dash.kvDate"), entry.date ? localDateTime(entry.date) : "—");
  if (entry.expiresAt) {
    const exp = expiryInfo(entry.expiresAt);
    kvPair(dl, t("dash.kvExpires"), exp.text, exp.cls);
  }
  kvPair(dl, t("dash.kvBuild"), entry.build ?? "—");
  kvPair(dl, t("dash.kvState"), entry.rawState ?? "—");
  if (entry.rolloutPercent !== undefined) {
    kvPair(dl, t("dash.kvRollout"), `${entry.rolloutPercent}%`);
  }
  box.append(dl);

  if (entry.eas && typeof entry.eas === "object") box.append(easBlock(entry.eas));

  // Full release notes, line breaks preserved via CSS white-space: pre-wrap.
  const notes = el("div", "notes");
  notes.append(
    entry.releaseNotes ? el("div", "notes-text", entry.releaseNotes) : el("span", "dim", "—"),
  );
  box.append(notes);
  return box;
}

function detailRow(app, id, open, columns) {
  const tr = el("tr", "detail-tr");
  tr.id = id;
  tr.hidden = !open;
  const td = el("td", "detail-td");
  td.colSpan = columns;
  const panel = el("div", "detail");
  for (const ch of CHANNELS) {
    for (const entry of (app.channels ?? []).filter((c) => c.channel === ch.id)) {
      panel.append(detailEntry(entry, ch.label));
    }
  }
  td.append(panel);
  tr.append(td);
  return tr;
}

/* ── board table ─────────────────────────── */

function buildTable(apps) {
  const columns = 3 + CHANNELS.length; // toggle + App + OS + channels
  const table = el("table", "board");
  const head = el("tr");
  head.append(el("th", "toggle-col"), el("th", null, "App"), el("th", null, "OS"));
  for (const ch of CHANNELS) head.append(el("th", null, ch.label));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);

  const tbody = el("tbody");
  let prevApp = "";
  for (const app of apps) {
    const target = app.target ?? {};
    const key = String(target.key ?? "");
    const label = `${target.name ?? target.key ?? "?"}|${target.group ?? ""}`;
    const row = el("tr", "app-row");

    const hasDetails = !app.error && (app.channels ?? []).length > 0;
    // Latest bundle across ALL channels of this target — computed from the raw
    // snapshot, so chip filters (which only hide whole rows) cannot skew it.
    const latest = app.error ? null : latestBundle(app.channels ?? []);
    const detailId = `detail-${encodeURIComponent(key)}`;
    const open = expandedKeys.has(key);

    const toggleTd = el("td", "toggle-cell");
    if (hasDetails) {
      const btn = el("button", "toggle", open ? "▾" : "▸");
      btn.type = "button";
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-controls", detailId);
      btn.setAttribute(
        "aria-label",
        t("dash.rowDetails", {
          name: target.name ?? key,
          os: target.platform === "ios" ? "iOS" : "Android",
        }),
      );
      toggleTd.append(btn);
    }
    row.append(toggleTd);

    row.append(appCell(target, label !== prevApp, latest));
    prevApp = label;
    row.append(el("td", "os", target.platform === "ios" ? "iOS" : "Android"));

    if (app.error) {
      const errTd = el("td", "err", `error: ${app.error}`);
      errTd.colSpan = CHANNELS.length;
      row.append(errTd);
    } else {
      for (const ch of CHANNELS) row.append(channelCell(app, ch.id, latest));
    }
    tbody.append(row);

    if (hasDetails) {
      row.classList.add("expandable");
      const detail = detailRow(app, detailId, open, columns);
      tbody.append(detail);
      // One handler on the row: clicking anywhere toggles, and Enter/Space on
      // the button bubbles the same click event — keyboard works for free.
      // (Badge buttons stopPropagation, so they never reach this handler.)
      row.addEventListener("click", () => {
        const nowOpen = detail.hidden;
        detail.hidden = !nowOpen;
        if (nowOpen) expandedKeys.add(key);
        else expandedKeys.delete(key);
        const btn = row.querySelector(".toggle");
        if (btn) {
          btn.textContent = nowOpen ? "▾" : "▸";
          btn.setAttribute("aria-expanded", String(nowOpen));
        }
      });
    }
  }
  table.append(tbody);

  const scroll = el("div", "board-scroll");
  scroll.append(table);
  return scroll;
}

/* ── filter chips ────────────────────────── */

function chip(label, pressed, onSelect) {
  const btn = el("button", pressed ? "chip on" : "chip", label);
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(pressed));
  btn.addEventListener("click", onSelect);
  return btn;
}

function chipRow(label, ariaLabel, options, current, onPick) {
  const row = el("div", "chip-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", ariaLabel);
  row.append(el("span", "chip-label", label));
  for (const opt of options) {
    row.append(
      chip(opt.label, current === opt.id, () => {
        onPick(opt.id);
        if (lastSnapshot) render(lastSnapshot);
        // Full re-render replaces the chips — restore focus for keyboard users.
        filtersEl.querySelector(`.chip-row[aria-label="${ariaLabel}"] .chip.on`)?.focus();
      }),
    );
  }
  return row;
}

/** Unique non-empty target.group values, in snapshot order. */
function groupsOf(apps) {
  const groups = [];
  for (const app of apps) {
    const g = app.target?.group;
    if (typeof g === "string" && g !== "" && !groups.includes(g)) groups.push(g);
  }
  return groups;
}

function renderFilters(apps) {
  const groups = groupsOf(apps);
  if (!groups.includes(groupFilter)) groupFilter = "all";

  filtersEl.replaceChildren();
  if (apps.length === 0) {
    filtersEl.hidden = true;
    return;
  }
  filtersEl.hidden = false;

  const osOptions = [
    { id: "all", label: t("dash.filterAll") },
    { id: "ios", label: "iOS" },
    { id: "android", label: "Android" },
  ];
  filtersEl.append(
    chipRow(t("dash.filterOs"), t("dash.filterByOs"), osOptions, osFilter, (id) => {
      osFilter = id;
    }),
  );
  // No groups in the data → no group filter row at all.
  if (groups.length > 0) {
    const options = [
      { id: "all", label: t("dash.filterAll") },
      ...groups.map((g) => ({ id: g, label: g })),
    ];
    filtersEl.append(
      chipRow(t("dash.filterGroup"), t("dash.filterByGroup"), options, groupFilter, (id) => {
        groupFilter = id;
      }),
    );
  }
}

/** AND of the two chip filters — pure client-side show/hide, no refetch. */
function applyFilters(apps) {
  return apps.filter(
    (app) =>
      (osFilter === "all" || app.target?.platform === osFilter) &&
      (groupFilter === "all" || app.target?.group === groupFilter),
  );
}

/* ── page ────────────────────────────────── */

function notice(title, lines) {
  const box = el("div", "notice");
  box.append(el("div", "title", title));
  for (const line of lines) {
    const p = el("div");
    for (const part of line) {
      p.append(typeof part === "string" ? part : el("code", null, part.code));
    }
    box.append(p);
  }
  return box;
}

/** Dictionary strings mark code as `backtick` segments → render them as <code>. */
function noticeLine(text) {
  return text.split("`").map((part, i) => (i % 2 === 1 ? { code: part } : part));
}

function render(snapshot) {
  lastSnapshot = snapshot;
  lastError = null;
  boardEl.replaceChildren();

  if (snapshot.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    const warn = notice(t("dash.schemaWarnTitle", { version: snapshot.schemaVersion }), [
      [t("dash.schemaWarnBody", { supported: SUPPORTED_SCHEMA_VERSION })],
    ]);
    warn.classList.add("warn");
    boardEl.append(warn);
  }

  const apps = Array.isArray(snapshot.apps) ? snapshot.apps : [];
  renderFilters(apps);
  const visible = applyFilters(apps);

  if (apps.length === 0) {
    boardEl.append(notice(t("dash.emptyTitle"), [noticeLine(t("dash.emptyBody"))]));
  } else if (visible.length === 0) {
    boardEl.append(el("div", "filter-empty", t("dash.filterEmpty")));
  } else {
    boardEl.append(buildTable(visible));
  }

  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
  metaEl.textContent = generated ? `· ${generated.toLocaleString()}` : "";
  const targetCount =
    visible.length === apps.length
      ? t("dash.targets", { n: apps.length })
      : t("dash.targetsFiltered", { shown: visible.length, total: apps.length });
  footEl.textContent =
    `schema v${snapshot.schemaVersion ?? "?"} · ${targetCount} · ` +
    t("dash.autoRefresh", { seconds: REFRESH_MS / 1000 });
}

function renderLoadError(err) {
  lastError = err;
  filtersEl.hidden = true;
  boardEl.replaceChildren(
    notice(t("dash.loadErrorTitle", { url: DATA_URL }), [
      [String(err?.message ?? err)],
      noticeLine(t("dash.loadErrorServe")),
      noticeLine(t("dash.loadErrorStatic")),
    ]),
  );
  metaEl.textContent = t("dash.noData");
  footEl.textContent = t("dash.retrying", { seconds: REFRESH_MS / 1000 });
}

async function refresh() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    render(await res.json());
  } catch (err) {
    renderLoadError(err);
  }
}

document.documentElement.lang = lang;
metaEl.textContent = t("dash.loading");
renderLangSwitch();
refresh();
setInterval(refresh, REFRESH_MS);
