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

const boardEl = document.getElementById("board");
const metaEl = document.getElementById("meta");
const footEl = document.getElementById("foot");

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

function buildTable(apps) {
  const table = el("table", "board");
  const head = el("tr");
  head.append(el("th", null, "App"), el("th", null, "OS"));
  for (const ch of CHANNELS) head.append(el("th", null, ch.label));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);

  const tbody = el("tbody");
  let prevApp = "";
  for (const app of apps) {
    const target = app.target ?? {};
    const label = `${target.name ?? target.key ?? "?"}|${target.group ?? ""}`;
    const row = el("tr");
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
  }
  table.append(tbody);

  const scroll = el("div", "board-scroll");
  scroll.append(table);
  return scroll;
}

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
  boardEl.replaceChildren();

  if (snapshot.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    const warn = notice(`snapshot schemaVersion ${snapshot.schemaVersion}`, [
      [`this dashboard understands version ${SUPPORTED_SCHEMA_VERSION} — rendering best-effort.`],
    ]);
    warn.classList.add("warn");
    boardEl.append(warn);
  }

  const apps = Array.isArray(snapshot.apps) ? snapshot.apps : [];
  if (apps.length === 0) {
    boardEl.append(
      notice("no apps in this snapshot", [
        ["add apps to ", { code: "storepulse.config.json" }, " and regenerate."],
      ]),
    );
  } else {
    boardEl.append(buildTable(apps));
  }

  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
  metaEl.textContent = generated ? `· ${generated.toLocaleString()}` : "";
  footEl.textContent =
    `schema v${snapshot.schemaVersion ?? "?"} · ${apps.length} targets · ` +
    `auto-refresh ${REFRESH_MS / 1000}s`;
}

function renderLoadError(err) {
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
