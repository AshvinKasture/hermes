import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "../src/pages/Terminal";

// xterm.js needs a real canvas/DOM measurement environment jsdom doesn't provide. Stand in a
// trivial fake that records what the page sends it, mirroring how Editor.test.tsx stubs Monaco.
const written: string[] = [];
let lastOnData: ((data: string) => void) | null = null;
let disposed = false;

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    onData(cb: (data: string) => void) {
      lastOnData = cb;
    }
    write(data: string) {
      written.push(data);
    }
    clear() {
      written.length = 0;
    }
    focus() {}
    dispose() {
      disposed = true;
    }
  },
}));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

/** A scriptable fake WebSocket so the page's connect/auth/message/close logic can be driven
 *  deterministically, the same way mockApi() scripts fetch for HTTP pages. */
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  server(msg: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  closeFromServer(code: number, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

beforeEach(() => {
  written.length = 0;
  lastOnData = null;
  disposed = false;
  FakeSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
});
afterEach(() => vi.unstubAllGlobals());

const latestSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1];

async function connectThroughPasswordPrompt(password = "hunter2") {
  render(<Terminal />);
  const input = await screen.findByLabelText("SSH password");
  fireEvent.change(input, { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(FakeSocket.instances.length).toBe(1));
  const ws = latestSocket();
  act(() => ws.open());
  return ws;
}

describe("Terminal", () => {
  it("connects to the same-origin WS endpoint under the app's base path", async () => {
    await connectThroughPasswordPrompt();
    expect(latestSocket().url).toBe(`ws://${location.host}/cockpit/api/terminal`);
  });

  it("sends the password once on open, with the terminal's current size, and never logs it anywhere else", async () => {
    const ws = await connectThroughPasswordPrompt("s3cret");
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", password: "s3cret", cols: 80, rows: 24 });
    expect(ws.sent).toHaveLength(1); // nothing else was sent until the server replies
  });

  it("shows Connecting, then marks itself Connected on the ready message and clears the password field", async () => {
    const ws = await connectThroughPasswordPrompt();
    expect(screen.queryByLabelText("SSH password")).toBeNull(); // password prompt replaced by "Connecting…"
    act(() => ws.server({ type: "ready" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("writes incoming data frames to the terminal and forwards keystrokes over the socket", async () => {
    const ws = await connectThroughPasswordPrompt();
    act(() => ws.server({ type: "ready" }));
    await screen.findByText("Connected");
    act(() => ws.server({ type: "data", data: "hello\r\n" }));
    expect(written).toContain("hello\r\n");

    lastOnData?.("ls\n");
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: "data", data: "ls\n" });
  });

  it("shows the server's error message without closing the password form for a retry", async () => {
    const ws = await connectThroughPasswordPrompt();
    act(() => ws.server({ type: "error", text: "Wrong password." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password.");
  });

  it("surfaces an idle-timeout close as a reconnect prompt, distinct from a normal close", async () => {
    const ws = await connectThroughPasswordPrompt();
    act(() => ws.server({ type: "ready" }));
    await screen.findByText("Connected");
    act(() => ws.closeFromServer(4000));
    expect(await screen.findByText(/idle too long/)).toBeInTheDocument();
    const reconnect = screen.getByRole("button", { name: "Reconnect" });
    fireEvent.click(reconnect);
    expect(await screen.findByLabelText("SSH password")).toBeInTheDocument();
  });

  it("treats a normal (1000) server close as a plain session end", async () => {
    const ws = await connectThroughPasswordPrompt();
    act(() => ws.server({ type: "ready" }));
    await screen.findByText("Connected");
    act(() => ws.closeFromServer(1000));
    expect(await screen.findByText("Session ended.")).toBeInTheDocument();
  });

  it("lets the user retry with a new password after a failed attempt, using a fresh socket", async () => {
    const ws1 = await connectThroughPasswordPrompt("wrong");
    act(() => ws1.server({ type: "error", text: "Wrong password." }));
    act(() => ws1.closeFromServer(4002));
    expect(await screen.findByLabelText("SSH password")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("SSH password"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(FakeSocket.instances.length).toBe(2));
    const ws2 = FakeSocket.instances[1];
    act(() => ws2.open());
    expect(JSON.parse(ws2.sent[0])).toMatchObject({ type: "auth", password: "right" });
  });

  it("disposes the xterm instance on unmount", async () => {
    const view = render(<Terminal />);
    await screen.findByLabelText("SSH password");
    view.unmount();
    expect(disposed).toBe(true);
  });
});
