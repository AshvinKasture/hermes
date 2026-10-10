import { useEffect, useRef, useState } from "react";
import { BASE } from "../lib/api";
type ServerMsg =
  | { type: "ready" }
  | { type: "data"; data: string }
  | { type: "status"; text: string }
  | { type: "error"; text: string };

/** wss://.../cockpit/api/terminal, same-origin, cookie-authenticated by the browser automatically. */
function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${BASE}/api/terminal`;
}

type Phase = "password" | "connecting" | "connected" | "closed";

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState<string | null>(null);

  // Mount xterm.js once; it stays alive across reconnect attempts in the same tab.
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !containerRef.current) return;
      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: { background: "#0b0d12", foreground: "#e5e9f0", cursor: "#6ea8fe" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.onData((data) => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: "data", data })));
      termRef.current = term;
      fitRef.current = fit;
    })();
    return () => {
      disposed = true;
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, []);

  // Resize the PTY when the panel resizes.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      fit.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  function connect(pw: string) {
    setError(null);
    setPhase("connecting");
    termRef.current?.clear();
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => {
      const term = termRef.current;
      ws.send(JSON.stringify({ type: "auth", password: pw, cols: term?.cols ?? 80, rows: term?.rows ?? 24 }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (msg.type === "ready") {
        setPhase("connected");
        setPassword(""); // the password has done its job; don't keep it around in state either
        termRef.current?.focus();
      } else if (msg.type === "data") {
        termRef.current?.write(msg.data);
      } else if (msg.type === "status") {
        termRef.current?.write(msg.text);
      } else if (msg.type === "error") {
        setError(msg.text);
        setPhase("password");
      }
    };
    ws.onclose = (ev) => {
      wsRef.current = null;
      setPhase((p) => (p === "connected" || p === "connecting" ? "closed" : p));
      setCloseReason(ev.code === 4000 ? "Session closed after being idle too long." : ev.code === 1000 ? "Session ended." : ev.reason || "Connection closed.");
    };
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    const pw = password;
    connect(pw);
  }

  function reconnect() {
    setCloseReason(null);
    setPhase("password");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-ck-border bg-ck-surface shadow-lg shadow-black/20">
      <div className="flex items-center justify-between border-b border-ck-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Terminal</h1>
          <p className="text-xs text-ck-muted">A real shell on this VM, over SSH as ashvin. Sessions close after 15 minutes idle.</p>
        </div>
        {phase === "connected" && (
          <span className="flex items-center gap-1.5 text-xs text-ck-green">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ck-green" /> Connected
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-[#0b0d12] p-2">
        <div ref={containerRef} className="h-full w-full" aria-label="Terminal output" />

        {phase !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-ck-bg/90 p-6">
            {phase === "password" && (
              <form onSubmit={submitPassword} className="w-full max-w-xs space-y-3 rounded-2xl border border-ck-border bg-ck-surface p-5 shadow-xl">
                <div>
                  <h2 className="text-sm font-semibold">Open a terminal</h2>
                  <p className="mt-1 text-xs text-ck-muted">Enter ashvin&apos;s SSH password. It&apos;s sent once to open the session and isn&apos;t stored.</p>
                </div>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="SSH password"
                  placeholder="Password"
                  className="w-full rounded-lg border border-ck-border bg-ck-raised px-3 py-2 text-sm text-ck-text outline-none focus:border-ck-accent"
                />
                {error && (
                  <p role="alert" className="text-xs text-ck-red">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={!password} className="w-full rounded-lg bg-ck-accent px-3 py-2 text-sm font-medium text-ck-bg transition disabled:cursor-not-allowed disabled:opacity-50">
                  Connect
                </button>
              </form>
            )}
            {phase === "connecting" && <p className="text-sm text-ck-muted">Connecting…</p>}
            {phase === "closed" && (
              <div className="w-full max-w-xs space-y-3 rounded-2xl border border-ck-border bg-ck-surface p-5 text-center shadow-xl">
                <p className="text-sm text-ck-muted">{closeReason}</p>
                <button onClick={reconnect} className="w-full rounded-lg border border-ck-border px-3 py-2 text-sm text-ck-text transition hover:bg-ck-raised">
                  Reconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
