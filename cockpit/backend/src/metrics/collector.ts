import fs from "node:fs";

export interface CpuTimes {
  idle: number;
  total: number;
}

export interface CpuSnapshot {
  all: CpuTimes;
  cores: CpuTimes[];
}

export interface MemInfo {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPct: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface CurrentMetrics {
  ts: number;
  cpuPct: number;
  cpuCores: number[];
  coreCount: number;
  mem: MemInfo;
  uptimeSeconds: number;
  loadAvg: [number, number, number];
}

/** Parse /proc/stat into aggregate and per-core jiffies. */
export function parseProcStat(text: string): CpuSnapshot {
  const all: CpuTimes = { idle: 0, total: 0 };
  const cores: CpuTimes[] = [];
  for (const line of text.split("\n")) {
    const m = /^(cpu\d*)\s+(.+)$/.exec(line);
    if (!m) continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    // user nice system idle iowait irq softirq steal
    const idle = (f[3] ?? 0) + (f[4] ?? 0);
    const total = f.slice(0, 8).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    if (m[1] === "cpu") {
      all.idle = idle;
      all.total = total;
    } else {
      cores.push({ idle, total });
    }
  }
  return { all, cores };
}

/** CPU busy percentage between two samples (0-100, one decimal). */
export function cpuPercent(prev: CpuTimes, next: CpuTimes): number {
  const dTotal = next.total - prev.total;
  if (dTotal <= 0) return 0;
  const dIdle = next.idle - prev.idle;
  const pct = (1 - dIdle / dTotal) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

/** Parse /proc/meminfo. "Used" follows `free`: total - MemAvailable. */
export function parseMeminfo(text: string): MemInfo {
  const kb: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  const totalBytes = kb.MemTotal ?? 0;
  const availableBytes = kb.MemAvailable ?? kb.MemFree ?? 0;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  const swapTotalBytes = kb.SwapTotal ?? 0;
  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usedPct: totalBytes ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
    swapTotalBytes,
    swapUsedBytes: Math.max(0, swapTotalBytes - (kb.SwapFree ?? 0)),
  };
}

export function parseUptime(text: string): number {
  return Math.floor(Number(text.trim().split(/\s+/)[0]) || 0);
}

export function parseLoadAvg(text: string): [number, number, number] {
  const [a, b, c] = text.trim().split(/\s+/).map(Number);
  return [a || 0, b || 0, c || 0];
}

export interface ProcSource {
  read(file: string): string;
}

/**
 * Reads host metrics from /proc. PROC_ROOT can point at a host /proc mount;
 * inside a container /proc/stat, meminfo and uptime already reflect the host.
 */
export class MetricsCollector {
  private prev: CpuSnapshot | null = null;

  constructor(private src: ProcSource = { read: (f) => fs.readFileSync(`${process.env.PROC_ROOT || "/proc"}/${f}`, "utf8") }) {}

  /** Take a reading. The first call has no baseline, so CPU is measured over a short window. */
  current(now = Date.now()): CurrentMetrics {
    const snap = parseProcStat(this.src.read("stat"));
    const prev = this.prev;
    this.prev = snap;
    const base = prev ?? snap;
    const cores = snap.cores.map((c, i) => cpuPercent(base.cores[i] ?? c, c));
    return {
      ts: now,
      cpuPct: cpuPercent(base.all, snap.all),
      cpuCores: cores,
      coreCount: snap.cores.length,
      mem: parseMeminfo(this.src.read("meminfo")),
      uptimeSeconds: parseUptime(this.src.read("uptime")),
      loadAvg: parseLoadAvg(this.src.read("loadavg")),
    };
  }
}
