import { describe, expect, it } from "vitest";
import { PRESETS, formatBytes, formatTimeTick, formatUptime, fromLocalInput, levelFor, timeTicks, toLocalInput } from "../src/lib/format";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(8 * 1024 ** 3)).toBe("8.0 GB");
    expect(formatBytes(250 * 1024 ** 2)).toBe("250 MB");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
  });

  it("formats uptime", () => {
    expect(formatUptime(45)).toBe("0m 45s");
    expect(formatUptime(3 * 3600 + 120)).toBe("3h 2m");
    expect(formatUptime(90061)).toBe("1d 1h 1m");
    expect(formatUptime(-5)).toBe("0m 0s");
  });

  it("classifies usage levels", () => {
    expect(levelFor(10)).toBe("ok");
    expect(levelFor(70)).toBe("warn");
    expect(levelFor(90)).toBe("crit");
  });

  it("includes every requested preset with 24h available", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["10m", "30m", "1h", "6h", "12h", "24h", "3d", "7d", "30d", "90d"]);
    expect(PRESETS.find((p) => p.id === "24h")?.ms).toBe(86_400_000);
    expect(PRESETS.find((p) => p.id === "90d")?.ms).toBe(90 * 86_400_000);
  });

  it("round-trips local datetime inputs", () => {
    const ts = new Date(2026, 9, 8, 14, 5).getTime();
    expect(toLocalInput(ts)).toBe("2026-10-08T14:05");
    expect(fromLocalInput("2026-10-08T14:05")).toBe(ts);
  });
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const local = (h: number, m = 0, d = 8) => new Date(2026, 9, d, h, m).getTime();

describe("timeTicks", () => {
  it("never produces more than 7 labels for any preset", () => {
    const to = local(14, 7);
    for (const p of PRESETS) {
      const { ticks } = timeTicks(to - p.ms, to);
      expect(ticks.length, p.id).toBeGreaterThan(1);
      expect(ticks.length, p.id).toBeLessThanOrEqual(7);
    }
  });

  it("chooses round intervals per range", () => {
    const to = local(14, 7);
    const step = (ms: number) => timeTicks(to - ms, to).step;
    expect(step(10 * MIN)).toBe(2 * MIN);
    expect(step(HOUR)).toBe(10 * MIN);
    expect(step(6 * HOUR)).toBe(HOUR);
    expect(step(24 * HOUR)).toBe(6 * HOUR);
    expect(step(7 * DAY)).toBe(DAY);
    expect(step(90 * DAY)).toBe(14 * DAY);
  });

  it("aligns ticks to local clock boundaries and keeps them inside the range", () => {
    const from = local(10, 3);
    const to = local(16, 20);
    const { ticks, step } = timeTicks(from, to);
    expect(step).toBe(HOUR);
    expect(ticks.map((t) => new Date(t).getHours())).toEqual([11, 12, 13, 14, 15, 16]);
    for (const t of ticks) {
      expect(new Date(t).getMinutes()).toBe(0);
      expect(t).toBeGreaterThanOrEqual(from);
      expect(t).toBeLessThanOrEqual(to);
    }
  });

  it("handles a degenerate range and caps at the largest step", () => {
    expect(timeTicks(1000, 1000).ticks.length).toBeGreaterThanOrEqual(0);
    expect(timeTicks(0, 3650 * DAY).step).toBe(30 * DAY);
  });
});

describe("formatTimeTick", () => {
  it("shows HH:mm for sub-day steps and dates for day steps", () => {
    expect(formatTimeTick(local(14, 30), 30 * MIN, 6 * HOUR)).toBe("14:30");
    expect(formatTimeTick(local(0, 0, 8), DAY, 7 * DAY)).toMatch(/Oct\s*8|8\s*Oct/);
  });

  it("marks midnight with the date on multi-day spans only", () => {
    expect(formatTimeTick(local(0, 0, 9), 6 * HOUR, 3 * DAY)).toMatch(/Oct\s*9|9\s*Oct/);
    expect(formatTimeTick(local(0, 0, 9), 10 * MIN, HOUR)).toBe("00:00");
  });
});
