import { api } from "./api";

export interface CurrentMetrics {
  ts: number;
  cpuPct: number;
  cpuCores: number[];
  coreCount: number;
  mem: { totalBytes: number; usedBytes: number; availableBytes: number; usedPct: number; swapTotalBytes: number; swapUsedBytes: number };
  uptimeSeconds: number;
  loadAvg: [number, number, number];
}

export interface HistoryPoint {
  ts: number;
  cpuPct: number;
  memUsed: number;
  memTotal: number;
  memPct: number;
}

export interface Settings {
  retentionDays: number;
  limits: { min: number; max: number };
}

export const fetchCurrent = () => api<CurrentMetrics>("/metrics/current");
export const fetchHistory = (from: number, to: number) =>
  api<{ from: number; to: number; points: HistoryPoint[] }>(`/metrics?from=${Math.floor(from)}&to=${Math.floor(to)}&points=500`);
export const fetchSettings = () => api<Settings>("/settings");

// State-changing calls need the browser to send Origin, which fetch does for same-origin PUTs.
export const saveSettings = (retentionDays: number) =>
  api<{ retentionDays: number; pruned: number }>("/settings", { method: "PUT", body: JSON.stringify({ retentionDays }) });
