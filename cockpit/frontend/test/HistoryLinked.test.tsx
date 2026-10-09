import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "./helpers";

// jsdom has no layout, so real hover can't be simulated. Instead assert the
// wiring: both charts are given the same syncId, which Recharts uses to show
// the tooltip for the same timestamp on every chart in the group.
const seen: { title: string; syncId?: string }[] = [];
vi.mock("../src/components/MetricChart", () => ({
  MetricChart: (p: { title: string; syncId?: string }) => {
    seen.push({ title: p.title, syncId: p.syncId });
    return <div>{p.title}</div>;
  },
}));

import { History } from "../src/pages/History";

const points = [{ ts: Date.now() - 60_000, cpuPct: 10, memUsed: 1, memTotal: 2, memPct: 50 }];

describe("History linked charts", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("gives the CPU and memory charts the same sync group", async () => {
    mockApi({ "/metrics?": () => json({ from: 0, to: 1, points }) });
    render(<History />);
    await waitFor(() => expect(screen.getByText("Memory usage")).toBeInTheDocument());
    const cpu = seen.find((s) => s.title === "CPU usage");
    const mem = seen.find((s) => s.title === "Memory usage");
    expect(cpu?.syncId).toBeTruthy();
    expect(mem?.syncId).toBe(cpu?.syncId);
  });
});
