import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { History } from "../src/pages/History";
import { json, mockApi } from "./helpers";

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

const points = Array.from({ length: 5 }, (_, i) => ({ ts: Date.now() - (5 - i) * 60_000, cpuPct: 10 + i, memUsed: 1, memTotal: 2, memPct: 50 }));
const historyUrl = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.map(([u]) => new URL(String(u), "http://x"));

function lastRange(fetchMock: ReturnType<typeof mockApi>) {
  const u = historyUrl(fetchMock).at(-1)!;
  return { from: Number(u.searchParams.get("from")), to: Number(u.searchParams.get("to")) };
}

describe("History", () => {
  it("defaults to the 24 hour preset and offers all presets", async () => {
    const f = mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const r = lastRange(f);
    expect(Math.abs(r.to - r.from - 86_400_000)).toBeLessThan(1000);
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "true");
    for (const l of ["10 min", "30 min", "1 hour", "6 hours", "12 hours", "3 days", "7 days"]) {
      expect(screen.getByRole("button", { name: l })).toBeInTheDocument();
    }
  });

  it("requests a new range when a preset is chosen", async () => {
    const f = mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "10 min" }));
    await waitFor(() => {
      const r = lastRange(f);
      expect(Math.abs(r.to - r.from - 600_000)).toBeLessThan(1000);
    });
    expect(screen.getByRole("button", { name: "10 min" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies a valid custom range and rejects an invalid one", async () => {
    const f = mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [from, to] = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}T/) as HTMLInputElement[];

    fireEvent.change(from, { target: { value: "2026-10-08T10:00" } });
    fireEvent.change(to, { target: { value: "2026-10-08T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /apply custom/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/before end/i);

    fireEvent.change(to, { target: { value: "2026-10-08T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: /apply custom/i }));
    await waitFor(() => {
      const r = lastRange(f);
      expect(r.to - r.from).toBe(2 * 3_600_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects blank custom inputs", async () => {
    const f = mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [from] = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}T/) as HTMLInputElement[];
    fireEvent.change(from, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /apply custom/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/both a start and end/i);
  });

  it("refresh re-queries for presets and custom ranges", async () => {
    const f = mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: /apply custom/i }));
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(3));
    const before = f.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(before));
  });

  it("explains an empty period", async () => {
    mockApi({ "/metrics?": () => json({ from: 0, to: 1, points: [] }) });
    render(<History />);
    expect(await screen.findByText(/No data for this period yet/)).toBeInTheDocument();
  });

  it("shows an error when history fails to load", async () => {
    mockApi({ "/metrics?": () => json({ error: "db down" }, 500) });
    render(<History />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/db down/);
  });
});
