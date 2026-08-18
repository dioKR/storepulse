import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  type AppStatus,
  createSnapshot,
  DEFAULT_LANG,
  type Lang,
  uiString,
} from "@storepulse/core";
import { type CliConfig, loadConfig } from "./config.js";
import { collectConfiguredStatuses, collectStatuses } from "./snapshot.js";

export interface ServeOptions {
  /** Loopback by default — the board may list unreleased versions. */
  host: string;
  port: number;
  demo: boolean;
  /** Minimum seconds between store API round-trips (TTL cache). */
  refreshSeconds: number;
}

export const DEFAULT_PORT = 4780;
const DEFAULT_REFRESH_SECONDS = 60;

/** `storepulse serve [--demo] [--port <n>] [--host <addr>] [--refresh <seconds>]` */
export function parseServeArgs(argv: string[]): ServeOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      demo: { type: "boolean", default: false },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: String(DEFAULT_PORT) },
      refresh: { type: "string", default: String(DEFAULT_REFRESH_SECONDS) },
    },
  });

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be an integer between 0 and 65535, got "${values.port}"`);
  }
  const refreshSeconds = Number(values.refresh);
  if (!Number.isFinite(refreshSeconds) || refreshSeconds < 1) {
    throw new Error(`--refresh must be a number of seconds >= 1, got "${values.refresh}"`);
  }
  return { host: values.host, port, demo: values.demo, refreshSeconds };
}

/**
 * The dashboard is a plain static bundle. Look for it:
 *  1. next to this module — the published npm package ships it in dist/dashboard
 *  2. in the monorepo workspace — packages/dashboard/src is directly servable
 * Same relative depth from src/ (tsx dev) and dist/ (built), so both work.
 */
const DASHBOARD_CANDIDATES = ["./dashboard/", "../../dashboard/src/"];

export function findDashboardRoot(): string | null {
  for (const candidate of DASHBOARD_CANDIDATES) {
    const dir = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(resolve(dir, "index.html"))) return dir;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  send(res, status, `${JSON.stringify({ error: message })}\n`, "application/json; charset=utf-8");
}

/** TTL-cached snapshot body so a busy dashboard tab never hammers the store APIs. */
type StatusCollector = () => Promise<AppStatus[]>;

/** Build once per server process so connector-level caches survive snapshot refreshes. */
export function createStatusCollector(
  demo: boolean,
  configLoader: () => CliConfig = loadConfig,
): StatusCollector {
  if (demo) return () => collectStatuses(true);
  const config = configLoader();
  return () => collectConfiguredStatuses(config);
}

function makeSnapshotSource(opts: ServeOptions, collect: StatusCollector): () => Promise<string> {
  let cached: { at: number; body: string } | null = null;
  let inflight: Promise<string> | null = null;

  return async function snapshotBody(): Promise<string> {
    if (cached && Date.now() - cached.at < opts.refreshSeconds * 1000) return cached.body;
    inflight ??= (async () => {
      try {
        const body = `${JSON.stringify(createSnapshot(await collect()))}\n`;
        cached = { at: Date.now(), body };
        return body;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };
}

function serveStatic(root: string, pathname: string, res: ServerResponse): void {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const rootDir = resolve(root);
  const filePath = resolve(rootDir, rel);
  // Never step outside the dashboard bundle, whatever the URL looks like.
  if (filePath !== rootDir && !filePath.startsWith(rootDir + sep)) {
    sendError(res, 404, "not found");
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendError(res, 404, "not found");
    return;
  }
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  send(res, 200, readFileSync(filePath), type);
}

export function createDashboardServer(
  opts: ServeOptions,
  dashboardRoot: string,
  collect: StatusCollector = () => collectStatuses(opts.demo),
): Server {
  const snapshotBody = makeSnapshotSource(opts, collect);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendError(res, 405, "method not allowed");
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      sendError(res, 400, "bad request");
      return;
    }

    try {
      // /api/status is the API; /status.json is the same document under the
      // path the static dashboard fetches, so one build works in both modes.
      if (pathname === "/api/status" || pathname === "/status.json") {
        send(res, 200, await snapshotBody(), "application/json; charset=utf-8");
      } else {
        serveStatic(dashboardRoot, pathname, res);
      }
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err));
    }
  });
}

export async function runServe(argv: string[], lang: Lang = DEFAULT_LANG): Promise<void> {
  const opts = parseServeArgs(argv);

  const dashboardRoot = findDashboardRoot();
  if (!dashboardRoot) {
    throw new Error(uiString("serve.dashboardMissing", lang));
  }

  // Load real connectors once: their lifecycle cache must survive dashboard refreshes.
  const collect = createStatusCollector(opts.demo);

  if (opts.host !== "127.0.0.1" && opts.host !== "localhost" && opts.host !== "::1") {
    console.error(`storepulse: ${uiString("serve.bindWarning", lang, { host: opts.host })}`);
  }

  const server = createDashboardServer(opts, dashboardRoot, collect);
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, resolvePromise);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  const displayHost = opts.host.includes(":") ? `[${opts.host}]` : opts.host;
  const mode = opts.demo
    ? uiString("serve.modeDemo", lang)
    : uiString("serve.modeRefresh", lang, { seconds: opts.refreshSeconds });
  console.error(
    `\nstorepulse: ${uiString("serve.started", lang, {
      url: `http://${displayHost}:${port}`,
      mode,
    })}\n`,
  );

  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
