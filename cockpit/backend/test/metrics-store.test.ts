import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsCollector } from "../src/metrics/collector";
import { Sampler } from "../src/metrics/sampler";
import { MAX_POINTS, MetricsStore } from "../src/metrics/store";

const DAY = 24 * 60 * 60 * 1000;
const sample = (ts: number, cpu = 10) => ({ ts, cpuPct: cpu, memUsed: 500, memTotal: 1000 });

test("inserts and returns raw points for short ranges", () => {
  const s = new MetricsStore(":memory:");
  for (let i = 0; i < 5; i++) s.insert(sample(1_000_000 + i * 15_000, 10 * (i + 1)));
  assert.equal(s.count(), 5);
  const pts = s.range(1_000_000, 1_000_000 + 60_000);
  assert.equal(pts.length, 5);
  assert.equal(pts[0].memPct, 50);
  assert.equal(pts[4].cpuPct, 50);
  s.close();
});

test("downsamples long ranges to at most MAX_POINTS by averaging", () => {
  const s = new MetricsStore(":memory:");
  const start = 10 * DAY;
  for (let i = 0; i < 5760; i++) s.insert(sample(start + i * 15_000, i % 2 === 0 ? 0 : 100));
  const pts = s.range(start, start + DAY);
  assert.ok(pts.length <= MAX_POINTS && pts.length > 100, `got ${pts.length}`);
  for (const p of pts.slice(1, -1)) assert.ok(p.cpuPct > 30 && p.cpuPct < 70);
  assert.equal(s.range(start, start + DAY, 50).length <= 50, true);
  s.close();
});

test("range excludes samples outside the window and handles empty results", () => {
  const s = new MetricsStore(":memory:");
  s.insert(sample(1000));
  s.insert(sample(9000));
  assert.equal(s.range(2000, 8000).length, 0);
  assert.equal(s.range(0, 10000).length, 2);
  s.close();
});

test("retention defaults to 90 days and validates updates", () => {
  const s = new MetricsStore(":memory:");
  assert.equal(s.getRetentionDays(), 90);
  s.setRetentionDays(30);
  assert.equal(s.getRetentionDays(), 30);
  for (const bad of [0, 366, 1.5, NaN]) assert.throws(() => s.setRetentionDays(bad), RangeError);
  assert.equal(s.getRetentionDays(), 30);
  s.close();
});

test("prune removes only samples older than the retention window", () => {
  const s = new MetricsStore(":memory:");
  const now = 200 * DAY;
  s.insert(sample(now - 100 * DAY));
  s.insert(sample(now - 89 * DAY));
  s.insert(sample(now - 1000));
  assert.equal(s.prune(now), 1); // default 90d
  s.setRetentionDays(7);
  assert.equal(s.prune(now), 1);
  assert.equal(s.count(), 1);
  s.close();
});

test("sampler records a sample and survives collector errors", () => {
  const s = new MetricsStore(":memory:");
  const files: Record<string, string> = {
    stat: "cpu  1 0 1 8 0 0 0 0\ncpu0 1 0 1 8 0 0 0 0",
    meminfo: "MemTotal: 1000 kB\nMemAvailable: 500 kB",
    uptime: "10 1",
    loadavg: "0 0 0 1/1 1",
  };
  const c = new MetricsCollector({ read: (f) => files[f] });
  const sampler = new Sampler(c, s, 10);
  sampler.sampleOnce(5000);
  assert.equal(s.count(), 1);

  const broken = new Sampler(new MetricsCollector({ read: () => { throw new Error("no /proc"); } }), s);
  const err = console.error;
  console.error = () => {};
  try {
    broken.sampleOnce(6000);
  } finally {
    console.error = err;
  }
  assert.equal(s.count(), 1);
  s.close();
});

test("sampler start/stop schedules and clears timers", async () => {
  const s = new MetricsStore(":memory:");
  const files: Record<string, string> = {
    stat: "cpu  1 0 1 8 0 0 0 0\ncpu0 1 0 1 8 0 0 0 0",
    meminfo: "MemTotal: 1000 kB\nMemAvailable: 500 kB",
    uptime: "10 1",
    loadavg: "0 0 0 1/1 1",
  };
  const sampler = new Sampler(new MetricsCollector({ read: (f) => files[f] }), s, 20);
  sampler.start();
  sampler.start(); // idempotent
  await new Promise((r) => setTimeout(r, 90));
  sampler.stop();
  const n = s.count();
  assert.ok(n >= 1, `expected samples, got ${n}`);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(s.count(), n, "no samples after stop");
  s.close();
});
