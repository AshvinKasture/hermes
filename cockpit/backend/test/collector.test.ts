import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MetricsCollector,
  cpuPercent,
  parseLoadAvg,
  parseMeminfo,
  parseProcStat,
  parseUptime,
} from "../src/metrics/collector";

const STAT_A = `cpu  100 0 100 800 0 0 0 0 0 0
cpu0 50 0 50 400 0 0 0 0 0 0
cpu1 50 0 50 400 0 0 0 0 0 0
intr 1 2 3`;
const STAT_B = `cpu  200 0 200 1000 0 0 0 0 0 0
cpu0 100 0 100 500 0 0 0 0 0 0
cpu1 100 0 100 500 0 0 0 0 0 0`;

test("parses aggregate and per-core jiffies", () => {
  const s = parseProcStat(STAT_A);
  assert.deepEqual(s.all, { idle: 800, total: 1000 });
  assert.equal(s.cores.length, 2);
  assert.deepEqual(s.cores[0], { idle: 400, total: 500 });
});

test("iowait counts as idle; steal counts as busy", () => {
  const s = parseProcStat("cpu  10 0 10 50 30 0 0 10");
  assert.equal(s.all.idle, 80);
  assert.equal(s.all.total, 110);
});

test("cpuPercent computes busy share and clamps bad deltas", () => {
  assert.equal(cpuPercent({ idle: 800, total: 1000 }, { idle: 1000, total: 1400 }), 50);
  assert.equal(cpuPercent({ idle: 5, total: 10 }, { idle: 5, total: 10 }), 0); // no time elapsed
  assert.equal(cpuPercent({ idle: 5, total: 10 }, { idle: 1, total: 20 }), 100);
  assert.equal(cpuPercent({ idle: 5, total: 10 }, { idle: 50, total: 20 }), 0); // idle jumped (counter reset)
});

const MEM = `MemTotal:        1000000 kB
MemFree:          100000 kB
MemAvailable:     400000 kB
SwapTotal:        200000 kB
SwapFree:         150000 kB`;

test("memory used is total minus MemAvailable (matches `free`)", () => {
  const m = parseMeminfo(MEM);
  assert.equal(m.totalBytes, 1000000 * 1024);
  assert.equal(m.usedBytes, 600000 * 1024);
  assert.equal(m.usedPct, 60);
  assert.equal(m.swapUsedBytes, 50000 * 1024);
});

test("meminfo falls back to MemFree and tolerates empty input", () => {
  assert.equal(parseMeminfo("MemTotal: 1000 kB\nMemFree: 250 kB").usedBytes, 750 * 1024);
  const empty = parseMeminfo("");
  assert.equal(empty.usedPct, 0);
  assert.equal(empty.totalBytes, 0);
});

test("parses uptime and loadavg", () => {
  assert.equal(parseUptime("12345.67 9999.00\n"), 12345);
  assert.equal(parseUptime("garbage"), 0);
  assert.deepEqual(parseLoadAvg("0.10 0.20 0.30 1/200 999"), [0.1, 0.2, 0.3]);
  assert.deepEqual(parseLoadAvg(""), [0, 0, 0]);
});

test("collector reports CPU between consecutive readings", () => {
  const files: Record<string, string> = { stat: STAT_A, meminfo: MEM, uptime: "100.5 1", loadavg: "0.5 0.4 0.3 1/1 1" };
  const c = new MetricsCollector({ read: (f) => files[f] });
  const first = c.current(1000);
  assert.equal(first.cpuPct, 0); // no baseline yet
  assert.equal(first.coreCount, 2);

  files.stat = STAT_B; // +200 busy of +400 total => 50%
  const second = c.current(2000);
  assert.equal(second.ts, 2000);
  assert.equal(second.cpuPct, 50);
  assert.deepEqual(second.cpuCores, [50, 50]);
  assert.equal(second.uptimeSeconds, 100);
  assert.equal(second.mem.usedPct, 60);
});

test("collector works against this machine's real /proc", { skip: process.platform !== "linux" }, async () => {
  const c = new MetricsCollector();
  c.current();
  await new Promise((r) => setTimeout(r, 150));
  const m = c.current();
  assert.ok(m.coreCount >= 1);
  assert.ok(m.cpuPct >= 0 && m.cpuPct <= 100);
  assert.ok(m.mem.totalBytes > 0 && m.mem.usedBytes <= m.mem.totalBytes);
  assert.ok(m.uptimeSeconds > 0);
});
