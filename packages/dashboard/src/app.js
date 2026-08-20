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

import { androidReleases, latestTesterUrlFor } from "./downloads.js";
import { STATE_EXPLANATIONS, SUPPORTED_LANGS, UI_STRINGS } from "./i18n.js";
import {
  groupAppsByName,
  groupId,
  groupLabel,
  groupsOf,
  shouldShowGroupSelector,
} from "./layout.js";
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
const PAGE = document.body.dataset.page === "installs" ? "installs" : "status";

const boardEl = document.getElementById("board");
const filtersEl = document.getElementById("filters");
const metaEl = document.getElementById("meta");
const footEl = document.getElementById("foot");
const langSwitchEl = document.getElementById("lang-switch");
const explainEl = document.getElementById("explain");
const primaryNavEl = document.getElementById("primary-nav");
const navStatusEl = document.getElementById("nav-status");
const navInstallsEl = document.getElementById("nav-installs");
const pageTitleEl = document.getElementById("page-title");
const pageDescriptionEl = document.getElementById("page-description");

// UI state that must survive the 60s auto-refresh re-render.
const expandedKeys = new Set();
let osFilter = "all";
let activeGroup = null;
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
  renderPageChrome();
  renderLangSwitch();
  if (openExplainState) renderExplainPanel();
  if (lastSnapshot) render(lastSnapshot);
  else if (lastError) renderLoadError(lastError);
}

function renderPageChrome() {
  primaryNavEl.setAttribute("aria-label", t("dash.navLabel"));
  navStatusEl.textContent = t("dash.navStatus");
  navInstallsEl.textContent = t("dash.navInstalls");

  const titleKey = PAGE === "installs" ? "dash.pageInstallsTitle" : "dash.pageStatusTitle";
  const descriptionKey =
    PAGE === "installs" ? "dash.pageInstallsDescription" : "dash.pageStatusDescription";
  pageTitleEl.textContent = t(titleKey);
  pageDescriptionEl.textContent = t(descriptionKey);
  document.title = `storepulse — ${t(titleKey)}`;
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

  frag.append(stateBadge(entry));

  if (entry.build) frag.append(" ", el("span", "dim", `(${entry.build})`));
  return frag;
}

function stateBadge(entry) {
  const frag = document.createDocumentFragment();

  if (entry.state === "rollout") {
    frag.append(badgeButton("rollout", `${entry.rolloutPercent ?? "?"}%`));
  } else if (Object.hasOwn(STATE_EXPLANATIONS, entry.state) && entry.state !== "unknown") {
    frag.append(badgeButton(entry.state, STATE_EXPLANATIONS[entry.state].badge));
  } else {
    // Unmapped store state (upstream API change?) — gray UNKNOWN + raw state.
    frag.append(badgeButton("unknown", "UNKNOWN"));
    if (entry.rawState) frag.append(" ", el("span", "dim", `(${entry.rawState})`));
  }
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
  const td = el("td", "channel-cell");
  const entries = (app.channels ?? []).filter((c) => c.channel === channelId);
  if (entries.length === 0) {
    td.append(el("span", "dim", "—"));
    return td;
  }
  const prop = channelPropagation(entries, latest, app.target?.platform);
  if (prop) td.append(propMark(prop, latest), " ");
  entries.forEach((entry, i) => {
    if (i > 0) td.append(el("span", "dim", " · "));
    // Wrapping unit: entries may move to the next line, but never break inside
    const chunk = el("span", "entry");
    chunk.append(badge(entry));
    if (entry.easUpdate && typeof entry.easUpdate === "object") {
      const ota = el("span", "ota-chip", "OTA");
      ota.title = entry.easUpdate.createdAt
        ? t("dash.otaDeployed", { date: localDateTime(entry.easUpdate.createdAt) })
        : "OTA";
      chunk.append(" ", ota);
    }
    td.append(chunk);
  });
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

/** EAS Update block — the latest OTA bundle matched to this native binary. */
function easUpdateBlock(update) {
  const box = el("div", "eas eas-update");
  box.append(el("div", "eas-title", t("dash.easUpdateTitle")));
  const dl = el("dl", "kv");
  if (update.branch) kvPair(dl, t("dash.kvEasUpdateBranch"), update.branch);
  if (update.commit) {
    kvPair(dl, t("dash.kvEasCommit"), shortCommit(update.commit));
    dl.lastChild.title = update.commit;
  }
  if (update.createdAt) {
    kvPair(dl, t("dash.kvEasUpdatePublished"), localDateTime(update.createdAt));
  }
  if (update.runtimeVersion) kvPair(dl, t("dash.kvEasUpdateRuntime"), update.runtimeVersion);
  if (update.rolloutPercentage !== undefined) {
    kvPair(dl, t("dash.kvEasUpdateRollout"), `${update.rolloutPercentage}%`);
  }
  if (update.isRollbackToEmbedded) {
    kvPair(dl, t("dash.kvEasUpdateType"), t("dash.easUpdateRollback"));
  }
  if (update.message) kvPair(dl, t("dash.kvEasUpdateMessage"), update.message);
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
  if (entry.easUpdate && typeof entry.easUpdate === "object") {
    box.append(easUpdateBlock(entry.easUpdate));
  }

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

function latestEasUpdate(app, latest) {
  if (!latest) return null;
  const matching = (app.channels ?? []).filter((entry) => {
    if (!entry.easUpdate || entry.version !== latest.version) return false;
    if (latest.build == null || entry.build == null) return true;
    return String(entry.build) === String(latest.build);
  });
  return matching.reduce((best, entry) => {
    if (!best) return entry.easUpdate;
    return String(entry.easUpdate.createdAt ?? "").localeCompare(String(best.createdAt ?? "")) > 0
      ? entry.easUpdate
      : best;
  }, null);
}

/* ── group → app → platform board ───────── */

function platformRow(app, columns) {
  const target = app.target ?? {};
  const key = String(target.key ?? "");
  const row = el("tr", "app-row");
  const hasDetails = !app.error && (app.channels ?? []).length > 0;
  const latest = app.error ? null : latestBundle(app.channels ?? [], target.platform);
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
  row.append(el("td", "platform", target.platform === "ios" ? "iOS" : "Android"));
  const latestCell = el("td", "latest-cell", latest ? formatBundle(latest) : "—");
  const latestOta = latestEasUpdate(app, latest);
  if (latestOta?.createdAt) {
    latestCell.append(
      el(
        "span",
        "ota-summary",
        t("dash.otaDeployed", { date: localDateTime(latestOta.createdAt) }),
      ),
    );
  }
  row.append(latestCell);

  if (app.error) {
    const errTd = el("td", "err", `error: ${app.error}`);
    errTd.colSpan = CHANNELS.length;
    row.append(errTd);
  } else {
    for (const ch of CHANNELS) row.append(channelCell(app, ch.id, latest));
  }

  if (!hasDetails) return { row, detail: null };

  row.classList.add("expandable");
  const detail = detailRow(app, detailId, open, columns);
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
  return { row, detail };
}

function buildAppCard(card) {
  const columns = 3 + CHANNELS.length; // toggle + Platform + Latest + channels
  const section = el("section", "app-card");
  section.append(el("h2", "app-card-title", card.name));

  const table = el("table", "board app-board");
  const head = el("tr");
  head.append(el("th", "toggle-col"), el("th", null, "Platform"), el("th", null, "Latest"));
  for (const ch of CHANNELS) head.append(el("th", null, ch.label));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);

  const tbody = el("tbody");
  for (const app of card.apps) {
    const { row, detail } = platformRow(app, columns);
    tbody.append(row);
    if (detail) tbody.append(detail);
  }
  table.append(tbody);

  const scroll = el("div", "board-scroll");
  scroll.append(table);
  section.append(scroll);
  return section;
}

function buildBoard(apps) {
  const grid = el("div", "app-grid");
  for (const card of groupAppsByName(apps)) grid.append(buildAppCard(card));
  return grid;
}

/* ── Android install catalog ─────────────── */

function channelLabel(channelId) {
  return CHANNELS.find((channel) => channel.id === channelId)?.label ?? channelId;
}

async function copyInstallUrl(url, status) {
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = t("dash.copied");
  } catch {
    status.textContent = t("dash.copyFailed");
  }
}

function installActions(url, installLabel) {
  const actions = el("div", "release-actions");
  const install = el("a", "action primary", installLabel);
  install.href = url;
  install.target = "_blank";
  install.rel = "noopener noreferrer";

  const copy = el("button", "action", t("dash.copyLink"));
  copy.type = "button";
  const copyStatus = el("span", "copy-status");
  copyStatus.setAttribute("aria-live", "polite");
  copy.addEventListener("click", () => copyInstallUrl(url, copyStatus));
  actions.append(install, copy, copyStatus);
  return actions;
}

function releaseItem(release) {
  const item = el("article", "release-item");

  const main = el("div", "release-main");
  const title = el("h4", "release-title", release.version ?? "?");
  if (release.build) title.append(" ", el("span", "dim", `(${release.build})`));
  main.append(title);

  const channelRow = el("div", "release-channels");
  channelRow.append(el("span", "release-label", t("dash.availableChannels")));
  for (const entry of release.channelEntries) {
    const channel = el("span", "release-channel");
    channel.append(`${channelLabel(entry.channel)} `, stateBadge(entry));
    channelRow.append(channel);
  }
  main.append(channelRow);

  if (release.date) main.append(el("div", "release-date", localDateTime(release.date)));
  if (release.releaseNotes) main.append(el("div", "release-notes", release.releaseNotes));
  if (release.eas && typeof release.eas === "object") main.append(easBlock(release.eas));
  if (release.easUpdate && typeof release.easUpdate === "object") {
    main.append(easUpdateBlock(release.easUpdate));
  }

  if (release.installUrl) {
    item.append(main, installActions(release.installUrl, t("dash.installVersion")));
  } else {
    const unavailable = el("div", "install-unavailable");
    unavailable.append(
      el("strong", null, t("dash.installUnavailable")),
      el("span", null, t("dash.installUnavailableBody")),
    );
    item.append(main, unavailable);
  }
  return item;
}

function latestTesterBlock(target) {
  const url = latestTesterUrlFor(target);
  if (!url) return null;

  const block = el("div", "latest-tester");
  const copy = el("div", "latest-tester-copy");
  copy.append(
    el("strong", null, t("dash.latestTesterTitle")),
    el("span", null, t("dash.latestTesterBody")),
  );
  block.append(copy, installActions(url, t("dash.installLatest")));
  return block;
}

function buildInstallCard(card) {
  const section = el("section", "app-card release-card");
  section.append(el("h3", "app-card-title", card.name));

  const list = el("div", "release-list");
  for (const app of card.apps) {
    const latest = latestTesterBlock(app.target);
    if (latest) list.append(latest);
    for (const release of androidReleases(app)) list.append(releaseItem(release));
  }
  section.append(list);
  return section;
}

function buildInstallGroup(group, apps) {
  const section = el("section", "install-group");
  section.append(el("h2", "install-group-title", groupLabel(group, t("dash.ungrouped"))));
  const grid = el("div", "app-grid");
  for (const card of groupAppsByName(apps)) grid.append(buildInstallCard(card));
  section.append(grid);
  return section;
}

function buildInstalls(apps) {
  const root = el("div", "installs-view");
  const verified = notice(t("dash.verifiedLinksTitle"), [[t("dash.verifiedLinksBody")]]);
  verified.classList.add("install-info");
  const warning = notice(t("dash.installWarningTitle"), [[t("dash.installWarningBody")]]);
  warning.classList.add("warn", "install-warning");
  root.append(verified, warning);

  const androidApps = apps.filter(
    (app) =>
      app.target?.platform === "android" &&
      (androidReleases(app).length > 0 || latestTesterUrlFor(app.target) !== null),
  );
  if (androidApps.length === 0) {
    root.append(el("div", "filter-empty", t("dash.installsEmpty")));
    return root;
  }

  for (const group of groupsOf(androidApps)) {
    root.append(
      buildInstallGroup(
        group,
        androidApps.filter((app) => groupId(app.target) === group),
      ),
    );
  }
  return root;
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

function groupTabs(groups) {
  const row = el("div", "group-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", t("dash.filterByGroup"));
  row.append(el("span", "group-label", t("dash.filterGroup")));
  for (const id of groups) {
    const selected = activeGroup === id;
    const label = groupLabel(id, t("dash.ungrouped"));
    const btn = el("button", selected ? "group-tab on" : "group-tab", label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(selected));
    btn.addEventListener("click", () => {
      activeGroup = id;
      if (lastSnapshot) render(lastSnapshot);
      filtersEl.querySelector(".group-tab.on")?.focus();
    });
    row.append(btn);
  }
  return row;
}

function renderFilters(apps) {
  const groups = groupsOf(apps);
  if (!groups.includes(activeGroup)) activeGroup = groups[0] ?? null;

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
  if (shouldShowGroupSelector(groups)) {
    filtersEl.append(groupTabs(groups));
  }
  filtersEl.append(
    chipRow(t("dash.filterOs"), t("dash.filterByOs"), osOptions, osFilter, (id) => {
      osFilter = id;
    }),
  );
}

/** Group selection + OS chip — pure client-side show/hide, no refetch. */
function applyFilters(apps) {
  return apps.filter(
    (app) =>
      (activeGroup === null || groupId(app.target) === activeGroup) &&
      (osFilter === "all" || app.target?.platform === osFilter),
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
  let visible = apps;
  if (PAGE === "installs") {
    filtersEl.hidden = true;
  } else {
    renderFilters(apps);
    visible = applyFilters(apps);
  }

  if (apps.length === 0) {
    boardEl.append(notice(t("dash.emptyTitle"), [noticeLine(t("dash.emptyBody"))]));
  } else if (PAGE === "status" && visible.length === 0) {
    boardEl.append(el("div", "filter-empty", t("dash.filterEmpty")));
  } else {
    boardEl.append(PAGE === "installs" ? buildInstalls(apps) : buildBoard(visible));
  }

  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
  metaEl.textContent = generated ? `· ${generated.toLocaleString()}` : "";
  const shownCount =
    PAGE === "installs"
      ? apps.filter((app) => app.target?.platform === "android").length
      : visible.length;
  const targetCount =
    shownCount === apps.length
      ? t("dash.targets", { n: apps.length })
      : t("dash.targetsFiltered", { shown: shownCount, total: apps.length });
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
renderPageChrome();
renderLangSwitch();
refresh();
setInterval(refresh, REFRESH_MS);
