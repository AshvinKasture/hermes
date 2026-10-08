import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../src/pages/Dashboard";
import { CURRENT, json, mockApi } from "./helpers";

describe("Dashboard", () => {
  it("shows CPU, RAM, uptime and per-core usage", async () => {
    mockApi({ "/metrics/current": () => json(CURRENT) });
    render(<Dashboard />);
    expect(await screen.findByRole("img", { name: /CPU 42.5 percent/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /RAM 25.0 percent/ })).toBeInTheDocument();
    expect(screen.getByTestId("uptime")).toHaveTextContent("1d 1h 1m");
    expect(screen.getByText("2.0 GB of 8.0 GB")).toBeInTheDocument();
    expect(screen.getByText(/4 vCPUs/)).toBeInTheDocument();
    expect(screen.getByText("Core 2")).toBeInTheDocument();
    expect(screen.getByText("95.0%")).toBeInTheDocument();
    expect(screen.getByText(/Swap/)).toBeInTheDocument();
  });

  it("handles a single core without swap", async () => {
    mockApi({ "/metrics/current": () => json({ ...CURRENT, coreCount: 1, cpuCores: [5], mem: { ...CURRENT.mem, swapTotalBytes: 0 } }) });
    render(<Dashboard />);
    expect(await screen.findByText(/1 vCPU ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Swap/)).toBeNull();
  });

  it("shows an error when metrics cannot load", async () => {
    mockApi({ "/metrics/current": () => json({ error: "nope" }, 500) });
    render(<Dashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/nope/);
  });
});
