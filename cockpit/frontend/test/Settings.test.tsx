import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Settings } from "../src/pages/Settings";
import { json, mockApi } from "./helpers";

const SETTINGS = { retentionDays: 90, limits: { min: 1, max: 365 } };

describe("Settings", () => {
  it("loads the current retention and saves a new one", async () => {
    const fetchMock = mockApi({
      "/settings": (init) => (init?.method === "PUT" ? json({ retentionDays: 30, pruned: 12 }) : json(SETTINGS)),
    });
    render(<Settings />);
    const input = (await screen.findByLabelText(/retention/i)) as HTMLInputElement;
    expect(input.value).toBe("90");

    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved. Removed 12 older samples.");

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ retentionDays: 30 });
  });

  it("says plain 'Saved.' when nothing was pruned", async () => {
    mockApi({ "/settings": (init) => (init?.method === "PUT" ? json({ retentionDays: 90, pruned: 0 }) : json(SETTINGS)) });
    render(<Settings />);
    await screen.findByLabelText(/retention/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Saved\.$/);
  });

  it("validates input client-side and does not call the API", async () => {
    const fetchMock = mockApi({ "/settings": () => json(SETTINGS) });
    render(<Settings />);
    const input = await screen.findByLabelText(/retention/i);
    for (const bad of ["0", "400", "2.5", ""]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/between 1 and 365/);
    }
    expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT")).toHaveLength(0);
  });

  it("shows the server error when saving fails", async () => {
    mockApi({ "/settings": (init) => (init?.method === "PUT" ? json({ error: "Cross-origin request blocked" }, 403) : json(SETTINGS)) });
    render(<Settings />);
    await screen.findByLabelText(/retention/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Cross-origin/));
  });

  it("shows an error when settings cannot load", async () => {
    mockApi({ "/settings": () => json({ error: "down" }, 500) });
    render(<Settings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/down/);
  });
});
