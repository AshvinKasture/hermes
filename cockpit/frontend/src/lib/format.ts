export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export type Level = "ok" | "warn" | "crit";
export function levelFor(pct: number): Level {
  return pct >= 90 ? "crit" : pct >= 70 ? "warn" : "ok";
}

export interface RangePreset {
  id: string;
  label: string;
  ms: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const PRESETS: RangePreset[] = [
  { id: "10m", label: "10 min", ms: 10 * MIN },
  { id: "30m", label: "30 min", ms: 30 * MIN },
  { id: "1h", label: "1 hour", ms: HOUR },
  { id: "6h", label: "6 hours", ms: 6 * HOUR },
  { id: "12h", label: "12 hours", ms: 12 * HOUR },
  { id: "24h", label: "24 hours", ms: DAY },
  { id: "3d", label: "3 days", ms: 3 * DAY },
  { id: "7d", label: "7 days", ms: 7 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY },
  { id: "90d", label: "90 days", ms: 90 * DAY },
];
export const DEFAULT_PRESET = "24h";

/** Candidate tick spacings, smallest to largest. */
const TICK_STEPS = [
  MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY,
];

export interface TimeTicks {
  ticks: number[];
  step: number;
}

/**
 * Pick a round interval (5 min, 1 h, 6 h, 1 day, ...) that yields at most
 * `maxTicks` labels, and return ticks aligned to local clock boundaries.
 */
export function timeTicks(from: number, to: number, maxTicks = 7): TimeTicks {
  const span = Math.max(1, to - from);
  const step = TICK_STEPS.find((s) => span / s <= maxTicks) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const offset = new Date(from).getTimezoneOffset() * MIN; // align to local, not UTC, boundaries
  const first = Math.ceil((from - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (let t = first; t <= to; t += step) ticks.push(t);
  return { ticks, step };
}

const isLocalMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0;

/** Label for a tick: dates for day-scale steps (and midnights on longer spans), else HH:mm. */
export function formatTimeTick(ts: number, step: number, span: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  if (step >= DAY) return date;
  if (span > 12 * HOUR && isLocalMidnight(d)) return date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** `datetime-local` input value (local time) from epoch ms, and back. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}
