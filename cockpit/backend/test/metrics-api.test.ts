import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import type session from "express-session";
import { createApp } from "../src/app";
import { SqliteSessionStore } from "../src/auth/sqliteStore";
import { MetricsCollector } from "../src/metrics/collector";
import { MetricsStore } from "../src/metrics/store";
import { testConfig } from "./support/env";

let server: Server;
let base: string;
let cookie: string;
let metrics: MetricsStore;
const cfg = testConfig();

function sign(value: string): string {
  const sig = crypto.createHmac("sha256", cfg.sessionSecret).update(value).digest("base64").replace(/=+$/, "");
  return encodeURIComponent(`s:${value}.${sig}`);
}

const get = (p: string) => fetch(`${base}/cockpit/api${p}`, { headers: { cookie } });
const put = (p: string, body: unknown, origin = cfg.publicOrigin) =>
  fetch(`${base}/cockpit/api${p}`, {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

before(async () => {
  const sessions = new SqliteSessionStore(":memory:");
  await new Promise<void>((resolve) =>
    sessions.set(
      "sid",
      {
        cookie: { expires: new Date(Date.now() + 600_000), originalMaxAge: 600_000 },
        passport: { user: { id: "1", name: "O", email: cfg.allowedEmail, picture: "" } },
      } as never,
      () => resolve()
    )
  );
  cookie = `cockpit.sid=${sign("sid")}`;
  metrics = new MetricsStore(":memory:");
  const files: Record<string, string> = {
    stat: "cpu  1 0 1 8 0 0 0 0\ncpu0 1 0 1 8 0 0 0 0",
    meminfo: "MemTotal: 1000 kB\nMemAvailable: 250 kB",
    uptime: "3600.5 1",
    loadavg: "0.1 0.2 0.3 1/1 1",
  };
  const app = createApp(cfg, {
    sessionStore: sessions as session.Store,
    metricsStore: metrics,
    collector: new MetricsCollector({ read: (f) => files[f] }),
  });
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  server.close();
  metrics.close();
});

test("metrics and settings endpoints require auth", async () => {
  for (const p of ["/metrics/current", "/metrics", "/settings"]) {
    const res = await fetch(`${base}/cockpit/api${p}`);
    assert.equal(res.status, 401, p);
  }
});

test("GET /metrics/current returns live CPU, memory and uptime", async () => {
  const res = await get("/metrics/current");
  assert.equal(res.status, 200);
  const m = (await res.json()) as { mem: { usedPct: number }; uptimeSeconds: number; coreCount: number };
  assert.equal(m.mem.usedPct, 75);
  assert.equal(m.uptimeSeconds, 3600);
  assert.equal(m.coreCount, 1);
});

test("GET /metrics returns history for a range", async () => {
  const now = Date.now();
  for (let i = 0; i < 10; i++) metrics.insert({ ts: now - i * 15_000, cpuPct: 20, memUsed: 400, memTotal: 1000 });
  const res = await get(`/metrics?from=${now - 3_600_000}&to=${now + 1000}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { points: { cpuPct: number; memPct: number }[] };
  assert.equal(body.points.length, 10);
  assert.equal(body.points[0].memPct, 40);
});

test("GET /metrics defaults to the last 24 hours", async () => {
  const res = await get("/metrics");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { from: number; to: number };
  assert.ok(Math.abs(body.to - body.from - 86_400_000) < 5);
});

test("GET /metrics rejects invalid ranges", async () => {
  assert.equal((await get("/metrics?from=abc")).status, 400);
  assert.equal((await get("/metrics?from=2000&to=1000")).status, 400);
  assert.equal((await get("/metrics?from=0&to=99999999999999")).status, 400);
  assert.equal((await get("/metrics?points=NaN")).status, 400);
});

test("settings: default 90 days, update, validation and immediate prune", async () => {
  const initial = (await (await get("/settings")).json()) as { retentionDays: number; limits: { min: number; max: number } };
  assert.equal(initial.retentionDays, 90);
  assert.deepEqual(initial.limits, { min: 1, max: 365 });

  metrics.insert({ ts: Date.now() - 40 * 86_400_000, cpuPct: 1, memUsed: 1, memTotal: 2 });
  const ok = await put("/settings", { retentionDays: 30 });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { retentionDays: number; pruned: number };
  assert.equal(body.retentionDays, 30);
  assert.ok(body.pruned >= 1, "the 40-day-old sample should be pruned immediately");

  for (const bad of [0, 400, 2.5, "30", null]) {
    assert.equal((await put("/settings", { retentionDays: bad })).status, 400, String(bad));
  }
  assert.equal((await put("/settings", {})).status, 400);
});

test("settings update is blocked from a foreign origin", async () => {
  assert.equal((await put("/settings", { retentionDays: 10 }, "https://evil.example")).status, 403);
  const after = (await (await get("/settings")).json()) as { retentionDays: number };
  assert.equal(after.retentionDays, 30);
});
