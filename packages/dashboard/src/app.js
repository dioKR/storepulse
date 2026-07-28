/**
 * storepulse dashboard — renders one status.json snapshot as the release board.
 *
 * Single data source, both modes:
 *  - `storepulse serve` answers ./status.json (and /api/status) with live data
 *  - static deploys put a `storepulse snapshot --out status.json` file next to index.html
 * Same build artifact either way; there is no mode detection.
 *
 * All data is inserted via textContent — snapshot strings never become markup.
 */

const DATA_URL = "./status.json";
const REFRESH_MS = 60_000;
const SUPPORTED_SCHEMA_VERSION = 1;

const CHANNELS = [
  { id: "production", label: "Production" },
  { id: "beta", label: "Beta / TestFlight" },
  { id: "internal", label: "Internal" },
];

const STATE_LABELS = {
  live: "LIVE",
  "in-review": "REVIEW",
  pending: "PENDING",
  rejected: "REJECTED",
  halted: "HALTED",
  draft: "draft",
};

const OS_FILTERS = [
  { id: "all", label: "All" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
];

/** TestFlight builds expiring in ≤ this many days get a warning color. */
const EXPIRY_WARN_DAYS = 7;
const DAY_MS = 86_400_000;

const boardEl = document.getElementById("board");
const filtersEl = document.getElementById("filters");
const metaEl = document.getElementById("meta");
const footEl = document.getElementById("foot");

// UI state that must survive the 60s auto-refresh re-render.
const expandedKeys = new Set();
let osFilter = "all";
let groupFilter = "all";
let lastSnapshot = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One "2.4.1 LIVE (108)" cluster, colored like the CLI board. */
function badge(entry) {
  const frag = document.createDocumentFragment();
  frag.append(`${entry.version ?? "?"} `);

  if (entry.state === "rollout") {
    frag.append(el("span", "badge st-rollout", `${entry.rolloutPercent ?? "?"}%`));
  } else if (entry.state in STATE_LABELS) {
    frag.append(el("span", `badge st-${entry.state}`, STATE_LABELS[entry.state]));
  } else {
    // Unmapped store state (upstream API change?) — gray UNKNOWN + raw state.
    frag.append(el("span", "badge st-unknown", "UNKNOWN"));
    if (entry.rawState) frag.append(" ", el("span", "dim", `(${entry.rawState})`));
  }

  if (entry.build) frag.append(" ", el("span", "dim", `(${entry.build})`));
  return frag;
}

function channelCell(app, channelId) {
  const td = el("td");
  const entries = (app.channels ?? []).filter((c) => c.channel === channelId);
  if (entries.length === 0) {
    td.append(el("span", "dim", "—"));
    return td;
  }
  entries.forEach((entry, i) => {
    if (i > 0) td.append(el("span", "dim", "  ·  "));
    td.append(badge(entry));
  });
  return td;
}

function appCell(target, showName) {
  const td = el("td", "app");
  if (showName) {
    td.append(target.name ?? target.key ?? "?");
    if (target.group) td.append(" ", el("span", "group", `[${target.group}]`));
  }
  return td;
}

/* ── detail panel ────────────────────────── */

function localDateTime(iso) {
  const t = Date.parse(iso);
  // Unparseable date from upstream — show it verbatim rather than hiding it.
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

/** D-day text + warning class for a TestFlight expirationDate. */
function expiryInfo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { text: iso, cls: "" };
  const days = Math.ceil((t - Date.now()) / DAY_MS);
  const local = new Date(t).toLocaleDateString();
  if (days < 0) return { text: `EXPIRED (${local})`, cls: "exp-over" };
  const label = days === 0 ? "D-day" : `D-${days}`;
  return { text: `${label} (${local})`, cls: days <= EXPIRY_WARN_DAYS ? "exp-soon" : "" };
}

function kvPair(dl, label, value, valueClass) {
  dl.append(el("dt", null, label), el("dd", valueClass || null, value));
}

function detailEntry(entry, channelLabel) {
  const box = el("div", "detail-entry");

  const head = el("div", "detail-entry-head");
  head.append(el("span", "detail-channel", channelLabel), " ", badge(entry));
  box.append(head);

  const dl = el("dl", "kv");
  kvPair(dl, "date", entry.date ? localDateTime(entry.date) : "—");
  if (entry.expiresAt) {
    const exp = expiryInfo(entry.expiresAt);
    kvPair(dl, "expires", exp.text, exp.cls);
  }
  kvPair(dl, "build", entry.build ?? "—");
  kvPair(dl, "state", entry.rawState ?? "—");
  if (entry.rolloutPercent !== undefined) {
    kvPair(dl, "rollout", `${entry.rolloutPercent}%`);
  }
  box.append(dl);

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
        `${target.name ?? key} ${target.platform === "ios" ? "iOS" : "Android"} details`,
      );
      toggleTd.append(btn);
    }
    row.append(toggleTd);

    row.append(appCell(target, label !== prevApp));
    prevApp = label;
    row.append(el("td", "os", target.platform === "ios" ? "iOS" : "Android"));

    if (app.error) {
      const errTd = el("td", "err", `error: ${app.error}`);
      errTd.colSpan = CHANNELS.length;
      row.append(errTd);
    } else {
      for (const ch of CHANNELS) row.append(channelCell(app, ch.id));
    }
    tbody.append(row);

    if (hasDetails) {
      row.classList.add("expandable");
      const detail = detailRow(app, detailId, open, columns);
      tbody.append(detail);
      // One handler on the row: clicking anywhere toggles, and Enter/Space on
      // the button bubbles the same click event — keyboard works for free.
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

function chipRow(name, options, current, onPick) {
  const row = el("div", "chip-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", `filter by ${name}`);
  row.append(el("span", "chip-label", name));
  for (const opt of options) {
    row.append(
      chip(opt.label, current === opt.id, () => {
        onPick(opt.id);
        if (lastSnapshot) render(lastSnapshot);
        // Full re-render replaces the chips — restore focus for keyboard users.
        filtersEl.querySelector(`.chip-row[aria-label="filter by ${name}"] .chip.on`)?.focus();
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

  filtersEl.append(
    chipRow("os", OS_FILTERS, osFilter, (id) => {
      osFilter = id;
    }),
  );
  // No groups in the data → no group filter row at all.
  if (groups.length > 0) {
    const options = [{ id: "all", label: "All" }, ...groups.map((g) => ({ id: g, label: g }))];
    filtersEl.append(
      chipRow("group", options, groupFilter, (id) => {
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

function render(snapshot) {
  lastSnapshot = snapshot;
  boardEl.replaceChildren();

  if (snapshot.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    const warn = notice(`snapshot schemaVersion ${snapshot.schemaVersion}`, [
      [`this dashboard understands version ${SUPPORTED_SCHEMA_VERSION} — rendering best-effort.`],
    ]);
    warn.classList.add("warn");
    boardEl.append(warn);
  }

  const apps = Array.isArray(snapshot.apps) ? snapshot.apps : [];
  renderFilters(apps);
  const visible = applyFilters(apps);

  if (apps.length === 0) {
    boardEl.append(
      notice("no apps in this snapshot", [
        ["add apps to ", { code: "storepulse.config.json" }, " and regenerate."],
      ]),
    );
  } else if (visible.length === 0) {
    boardEl.append(el("div", "filter-empty", "no apps match the current filter"));
  } else {
    boardEl.append(buildTable(visible));
  }

  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
  metaEl.textContent = generated ? `· ${generated.toLocaleString()}` : "";
  const targetCount =
    visible.length === apps.length
      ? `${apps.length} targets`
      : `${visible.length}/${apps.length} targets`;
  footEl.textContent =
    `schema v${snapshot.schemaVersion ?? "?"} · ${targetCount} · ` +
    `auto-refresh ${REFRESH_MS / 1000}s`;
}

function renderLoadError(err) {
  filtersEl.hidden = true;
  boardEl.replaceChildren(
    notice(`could not load ${DATA_URL}`, [
      [String(err?.message ?? err)],
      ["serve mode: check the terminal running ", { code: "storepulse serve" }, "."],
      [
        "static mode: generate a snapshot with ",
        { code: "storepulse snapshot --demo --out status.json" },
        " and place it next to index.html.",
      ],
    ]),
  );
  metaEl.textContent = "· no data";
  footEl.textContent = `retrying every ${REFRESH_MS / 1000}s`;
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

refresh();
setInterval(refresh, REFRESH_MS);
