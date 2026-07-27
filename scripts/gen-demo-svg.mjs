// Generates docs/images/demo.svg — an animated (SMIL) terminal demo for the README.
// Typing "pnpm demo" → board lines reveal one by one → hold → loop.
import { writeFileSync } from "node:fs";

const CHAR_W = 8.4; // 14px monospace advance
const LINE_H = 24;
const X = 28;

const COLORS = {
  m: "#E24FD8", // magenta / brand
  g: "#52C98A", // live
  y: "#E0B34D", // review
  r: "#E8766C", // rejected
  c: "#5EC8D8", // rollout %
  d: "#8F879A", // dim
  w: "#ECE8EE", // ink
};

// segment: [text, colorKey, bold?]
const seg = (t, c, b = false) => ({ t, c, b });
const len = (segs) => segs.reduce((n, s) => n + s.t.length, 0);
const pad = (segs, width) => {
  const missing = width - len(segs);
  if (missing < 0) throw new Error(`cell overflow: ${JSON.stringify(segs)} needs ${-missing} less`);
  return missing === 0 ? segs : [...segs, seg(" ".repeat(missing), "d")];
};

// column widths: APP 21 | OS 9 | PRODUCTION 31 | BETA 18  → 79 chars/line
const W = { app: 21, os: 9, prod: 31, beta: 18 };
const TOTAL = W.app + W.os + W.prod + W.beta;

const row = (app, os, prod, beta) => [
  ...pad(app, W.app),
  ...pad(os, W.os),
  ...pad(prod, W.prod),
  ...pad(beta, W.beta),
];

const lines = [
  [...seg2full([seg("storepulse", "m", true), seg("  ·  one board, both stores", "d")])],
  [seg(" ".repeat(TOTAL), "d")],
  [
    ...row(
      [seg("APP", "w", true)],
      [seg("OS", "w", true)],
      [seg("PRODUCTION", "w", true)],
      [seg("BETA/TESTFLIGHT", "w", true)],
    ),
  ],
  [seg("─".repeat(TOTAL), "d")],
  row(
    [seg("Aurora ", "w"), seg("[prod]", "d")],
    [seg("iOS", "w")],
    [seg("2.4.1 ", "w"), seg("LIVE", "g", true), seg("  ·  2.5.0 ", "w"), seg("REVIEW", "y", true)],
    [seg("2.5.0 ", "w"), seg("LIVE", "g", true), seg(" (108)", "d")],
  ),
  row(
    [seg("", "w")],
    [seg("Android", "w")],
    [seg("2.4.1 ", "w"), seg("50%", "c", true), seg(" (241)", "d")],
    [seg("2.5.0 ", "w"), seg("LIVE", "g", true), seg(" (250)", "d")],
  ),
  row(
    [seg("Aurora Dev ", "w"), seg("[dev]", "d")],
    [seg("iOS", "w")],
    [seg("—", "d")],
    [seg("2.6.0 ", "w"), seg("LIVE", "g", true), seg(" (12)", "d")],
  ),
  row(
    [seg("Borealis ", "w"), seg("[prod]", "d")],
    [seg("iOS", "w")],
    [seg("1.9.2 ", "w"), seg("LIVE", "g", true), seg("  ·  1.9.3 ", "w"), seg("REJECTED", "r", true)],
    [seg("1.9.3 ", "w"), seg("LIVE", "g", true), seg(" (87)", "d")],
  ),
  row(
    [seg("", "w")],
    [seg("Android", "w")],
    [seg("1.9.2 ", "w"), seg("LIVE", "g", true), seg(" (192)", "d")],
    [seg("1.10.0 ", "w"), seg("LIVE", "g", true), seg(" (200)", "d")],
  ),
];

function seg2full(segs) {
  return pad(segs, TOTAL);
}

// sanity: every line must be exactly TOTAL chars
lines.forEach((l, i) => {
  if (len(l) !== TOTAL) throw new Error(`line ${i} is ${len(l)} chars, expected ${TOTAL}`);
});

const TEXT_LEN = Math.round(TOTAL * CHAR_W); // forced width → column grid is exact
const WIDTH = X * 2 + TEXT_LEN;
const PROMPT_Y = 68;
const BOARD_Y = 104;
const HEIGHT = BOARD_Y + (lines.length - 1) * LINE_H + 36;

const CMD = "pnpm demo";
const CMD_X = X + Math.round(2 * CHAR_W); // after "$ "
const CMD_LEN = Math.round(CMD.length * CHAR_W);

// typing steps (discrete clip widths + cursor positions)
const steps = CMD.length;
const clipValues = Array.from({ length: steps + 1 }, (_, i) => Math.round((i * CMD_LEN) / steps));
const curValues = clipValues.map((v) => CMD_X + v + 2);
const TYPE_BEGIN = 0.7;
const TYPE_DUR = 1.1;
const REVEAL_BEGIN = TYPE_BEGIN + TYPE_DUR + 0.4;
const STEP = 0.14;
const LOOP = (REVEAL_BEGIN + lines.length * STEP + 3.2).toFixed(1);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tspan = (s) =>
  `<tspan fill="${COLORS[s.c]}"${s.b ? ' font-weight="700"' : ""}>${esc(s.t)}</tspan>`;

const reset = (attr, to) =>
  `<animate attributeName="${attr}" to="${to}" dur="0.01s" begin="loop.begin" fill="freeze"/>`;

const boardLines = lines
  .map((l, i) => {
    const y = BOARD_Y + i * LINE_H;
    const begin = (REVEAL_BEGIN + i * STEP).toFixed(2);
    return `  <text x="${X}" y="${y}" xml:space="preserve" textLength="${TEXT_LEN}" lengthAdjust="spacing" opacity="0">${l.map(tspan).join("")}${reset("opacity", 0)}<animate attributeName="opacity" to="1" dur="0.01s" begin="loop.begin+${begin}s" fill="freeze"/></text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Menlo, Consolas, 'Courier New', monospace" font-size="14">
  <title>storepulse demo — pnpm demo renders a release board for every app on both stores</title>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="10" fill="#17161A"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="none" stroke="#2E2B33"/>
  <line x1="0" y1="38" x2="${WIDTH}" y2="38" stroke="#2E2B33"/>
  <rect x="16" y="15" width="9" height="9" fill="#E24FD8"/>
  <rect x="31" y="15" width="9" height="9" fill="#46414F"/>
  <rect x="46" y="15" width="9" height="9" fill="#46414F"/>
  <text x="64" y="24" fill="#8F879A" font-size="12">~/work — zsh</text>

  <rect width="0" height="0" fill="none"><animate id="loop" attributeName="width" values="0;0" dur="${LOOP}s" repeatCount="indefinite"/></rect>

  <text x="${X}" y="${PROMPT_Y}" xml:space="preserve"><tspan fill="#E24FD8" font-weight="700">$ </tspan></text>
  <clipPath id="typeclip"><rect x="${CMD_X}" y="${PROMPT_Y - 16}" width="0" height="22">${reset("width", 0)}<animate attributeName="width" calcMode="discrete" values="${clipValues.join(";")}" dur="${TYPE_DUR}s" begin="loop.begin+${TYPE_BEGIN}s" fill="freeze"/></rect></clipPath>
  <text x="${CMD_X}" y="${PROMPT_Y}" fill="#ECE8EE" xml:space="preserve" textLength="${CMD_LEN}" lengthAdjust="spacing" clip-path="url(#typeclip)">${esc(CMD)}</text>
  <rect y="${PROMPT_Y - 13}" width="8" height="16" fill="#E24FD8">
    ${reset("x", curValues[0])}<animate attributeName="x" calcMode="discrete" values="${curValues.join(";")}" dur="${TYPE_DUR}s" begin="loop.begin+${TYPE_BEGIN}s" fill="freeze"/>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite"/>
  </rect>

${boardLines}
</svg>
`;

writeFileSync(new URL("../docs/images/demo.svg", import.meta.url), svg);
console.log(`OK — ${WIDTH}x${HEIGHT}, ${lines.length} board lines, loop ${LOOP}s, ${Buffer.byteLength(svg)} bytes`);
