import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init))));
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("App auth states", () => {
  it("shows the login screen when anonymous", async () => {
    mockFetch(() => json({ error: "Not authenticated" }, 401));
    render(<App />);
    const link = await screen.findByRole("link", { name: /sign in with google/i });
    expect(link).toHaveAttribute("href", "/cockpit/auth/google");
  });

  it("shows an access-denied message for a forbidden account", async () => {
    mockFetch(() => json({ error: "Access denied" }, 403));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
  });

  it("shows an error for unexpected failures", async () => {
    mockFetch(() => json({ error: "boom" }, 500));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    mockFetch(() => new Response("oops", { status: 502, statusText: "Bad Gateway" }));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Bad Gateway/);
  });

  it("renders the shell for a signed-in user and signs out", async () => {
    mockFetch((url) =>
      url.endsWith("/api/me") ? json({ name: "Ashvin", email: "a@b.c", picture: "http://pic" }) : json({ ok: true })
    );
    render(<App />);
    expect(await screen.findByText(/welcome, ashvin/i)).toBeInTheDocument();
    expect(screen.getByText("a@b.c")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: /sign in with google/i })).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/cockpit/auth/logout", expect.objectContaining({ method: "POST" }));
  });

  it("shows initials when the user has no picture", async () => {
    mockFetch(() => json({ name: "Ashvin Kasture", email: "a@b.c", picture: "" }));
    const { container } = render(<App />);
    await screen.findByText(/welcome/i);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Ashvin Kasture")).toHaveTextContent("AK");
  });

  it("falls back to initials when the picture fails to load", async () => {
    mockFetch(() => json({ name: "Ashvin", email: "a@b.c", picture: "http://pic" }));
    render(<App />);
    const img = await screen.findByAltText("Ashvin");
    fireEvent.error(img);
    expect(await screen.findByLabelText("Ashvin")).toHaveTextContent("A");
  });

  it("uses a placeholder for a blank name", async () => {
    mockFetch(() => json({ name: " ", email: "a@b.c", picture: "" }));
    render(<App />);
    await screen.findByText(/welcome/i);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
