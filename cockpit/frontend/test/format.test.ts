import { describe, expect, it } from "vitest";
import { PRESETS, formatBytes, formatTick, formatUptime, fromLocalInput, levelFor, toLocalInput } from "../src/lib/format";

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
    expect(PRESETS.map((p) => p.id)).toEqual(["10m", "30m", "1h", "6h", "12h", "24h", "3d", "7d", "30d"]);
    expect(PRESETS.find((p) => p.id === "24h")?.ms).toBe(86_400_000);
  });

  it("formats ticks by span and round-trips local datetime inputs", () => {
    const ts = new Date(2026, 9, 8, 14, 5).getTime();
    expect(formatTick(ts, 3_600_000)).toMatch(/14:05/);
    expect(formatTick(ts, 3 * 86_400_000)).toMatch(/Oct.*14:05|8 Oct.*14:05/);
    expect(toLocalInput(ts)).toBe("2026-10-08T14:05");
    expect(fromLocalInput("2026-10-08T14:05")).toBe(ts);
  });
});
