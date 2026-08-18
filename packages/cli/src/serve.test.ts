import type { Server } from "node:http";
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDashboardServer,
  createStatusCollector,
  DEFAULT_PORT,
  findDashboardRoot,
  parseServeArgs,
} from "./serve.js";

describe("parseServeArgs", () => {
  it("defaults to loopback only", () => {
    const opts = parseServeArgs([]);
    expect(opts).toEqual({
      host: "127.0.0.1",
      port: DEFAULT_PORT,
      demo: false,
      refreshSeconds: 60,
    });
  });

  it("accepts overrides", () => {
    const opts = parseServeArgs(["--demo", "--host", "0.0.0.0", "--port", "0", "--refresh", "5"]);
    expect(opts).toEqual({ host: "0.0.0.0", port: 0, demo: true, refreshSeconds: 5 });
  });

  it("rejects nonsense ports and refresh intervals", () => {
    expect(() => parseServeArgs(["--port", "banana"])).toThrow(/--port/);
    expect(() => parseServeArgs(["--port", "70000"])).toThrow(/--port/);
    expect(() => parseServeArgs(["--refresh", "0"])).toThrow(/--refresh/);
  });
});

describe("createStatusCollector", () => {
  it("loads real connectors once and reuses them across refreshes", async () => {
    const fetchAppStatus = vi.fn(async (target) => ({
      target,
      channels: [],
      fetchedAt: new Date().toISOString(),
    }));
    const configLoader = vi.fn(() => ({
      targets: [
        {
          key: "android",
          name: "Android",
          platform: "android" as const,
          storeId: "com.example.app",
        },
      ],
      connectors: [{ id: "test", supports: () => true, fetchAppStatus }],
      enrichers: [],
    }));

    const collect = createStatusCollector(false, configLoader);
    await collect();
    await collect();

    expect(configLoader).toHaveBeenCalledTimes(1);
    expect(fetchAppStatus).toHaveBeenCalledTimes(2);
  });
});

describe("dashboard server (demo mode)", () => {
  let server: Server;
  let base: string;
  let port: number;

  beforeAll(async () => {
    const root = findDashboardRoot();
    if (!root) throw new Error("dashboard root not found — packages/dashboard/src missing?");
    server = createDashboardServer(
      { host: "127.0.0.1", port: 0, demo: true, refreshSeconds: 60 },
      root,
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || !address) throw new Error("no address");
    port = address.port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("GET /api/status returns a v1 snapshot of the demo board", async () => {
    const res = await fetch(`${base}/api/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const snap = await res.json();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.apps).toHaveLength(8);
  });

  it("GET /status.json serves the same document (single data source for the SPA)", async () => {
    const [api, file] = await Promise.all([
      fetch(`${base}/api/status`).then((r) => r.text()),
      fetch(`${base}/status.json`).then((r) => r.text()),
    ]);
    expect(file).toBe(api);
  });

  it("serves the dashboard at / with its assets", async () => {
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("storepulse");

    const js = await fetch(`${base}/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");

    const css = await fetch(`${base}/style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  it("404s unknown paths and 405s non-GET methods", async () => {
    expect((await fetch(`${base}/nope.html`)).status).toBe(404);
    expect((await fetch(`${base}/api/status`, { method: "POST" })).status).toBe(405);
  });

  it("does not serve files outside the dashboard root", async () => {
    // fetch() normalizes "..", so speak raw HTTP to exercise the guard.
    const raw = (path: string) =>
      new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
          socket.write(`GET ${path} HTTP/1.0\r\nHost: t\r\n\r\n`);
        });
        let data = "";
        socket.on("data", (chunk) => {
          data += chunk;
        });
        socket.on("end", () => resolve(data));
        socket.on("error", reject);
      });

    for (const path of [
      "/../package.json",
      "/../../core/package.json",
      "/%2e%2e/package.json",
      "/..%2fpackage.json",
    ]) {
      const response = await raw(path);
      expect(response).not.toContain('"name"');
      expect(response).toMatch(/HTTP\/1\.[01] (400|404)/);
    }
  });
});
