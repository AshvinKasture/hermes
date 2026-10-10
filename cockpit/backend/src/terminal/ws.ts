import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import { ServerResponse as HttpServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { Client as SshClient } from "ssh2";
import { WebSocketServer, type WebSocket } from "ws";
import { isAllowedIdentity } from "../auth/allowlist";
import type { Config } from "../config";

/**
 * Bridges a browser WebSocket to a real PTY on the host, reached over SSH as `ashvin`.
 *
 * Why SSH and not a local PTY in the container: the container is unprivileged and only has
 * `ashvin`'s home bind-mounted; a shell started in-process would not be the host's real shell
 * environment and could not run `sudo`. SSH gives a genuine host login session.
 *
 * The SSH password is typed into the terminal's login prompt by the browser, sent once over this
 * (already HTTPS + authenticated-session-gated) WebSocket, used to open the SSH connection, and
 * then dropped — this module never writes it anywhere, logs it, or keeps it past the `ready`/
 * `error` event for that connection.
 */

const MAX_FRAME = 64 * 1024;

type ClientMsg =
  | { type: "auth"; password: string; cols: number; rows: number }
  | { type: "data"; data: string }
  | { type: "resize"; cols: number; rows: number };

function send(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function safeParse(raw: string): ClientMsg | null {
  try {
    const m = JSON.parse(raw) as ClientMsg;
    if (!m || typeof m !== "object" || typeof (m as { type?: unknown }).type !== "string") return null;
    return m;
  } catch {
    return null;
  }
}

export function createTerminalServer(config: Config, audit: (who: string, action: string, detail: string) => void) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage & { cockpitUser?: string }) => {
    let ssh: SshClient | null = null;
    let authenticated = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const who = req.cockpitUser ?? "unknown";
    const startedAt = Date.now();

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        send(ws, { type: "status", text: `\r\n\r\n[Session closed after ${Math.round(config.terminal.idleTimeoutMs / 60000)} minutes idle.]\r\n` });
        ws.close(4000, "idle timeout");
      }, config.terminal.idleTimeoutMs);
    };
    resetIdle();

    const closeAll = (reason: string) => {
      if (idleTimer) clearTimeout(idleTimer);
      ssh?.end();
      audit(who, "terminal.end", `${reason} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
    };

    ws.on("message", (raw: Buffer, isBinary: boolean) => {
      if (isBinary || raw.length > MAX_FRAME) return;
      resetIdle();
      const msg = safeParse(raw.toString("utf8"));
      if (!msg) return;

      if (msg.type === "auth") {
        if (authenticated) return;
        if (typeof msg.password !== "string" || !msg.password) {
          send(ws, { type: "error", text: "Password required." });
          return;
        }
        const cols = Number.isInteger(msg.cols) && msg.cols > 0 ? msg.cols : 80;
        const rows = Number.isInteger(msg.rows) && msg.rows > 0 ? msg.rows : 24;
        ssh = new SshClient();
        ssh.on("ready", () => {
          authenticated = true;
          audit(who, "terminal.start", `${config.terminal.user}@${config.terminal.host}`);
          ssh!.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
            if (err) {
              send(ws, { type: "error", text: `Could not start a shell: ${err.message}` });
              ws.close(4001, "shell failed");
              return;
            }
            send(ws, { type: "ready" });
            stream.on("data", (d: Buffer) => send(ws, { type: "data", data: d.toString("utf8") }));
            stream.stderr?.on("data", (d: Buffer) => send(ws, { type: "data", data: d.toString("utf8") }));
            stream.on("close", () => ws.close(1000, "shell closed"));
            ws.on("message", (raw2: Buffer, isBinary2: boolean) => {
              if (isBinary2 || raw2.length > MAX_FRAME) return;
              resetIdle();
              const m2 = safeParse(raw2.toString("utf8"));
              if (!m2) return;
              if (m2.type === "data" && typeof m2.data === "string") stream.write(m2.data);
              else if (m2.type === "resize" && Number.isInteger(m2.cols) && Number.isInteger(m2.rows)) {
                stream.setWindow(m2.rows, m2.cols, 0, 0);
              }
            });
          });
        });
        ssh.on("error", (err) => {
          send(ws, { type: "error", text: /auth/i.test(err.message) ? "Wrong password." : `Could not connect: ${err.message}` });
          audit(who, "terminal.auth_failed", err.message);
          ws.close(4002, "ssh error");
        });
        ssh.connect({
          host: config.terminal.host,
          port: config.terminal.port,
          username: config.terminal.user,
          password: msg.password,
          readyTimeout: 10_000,
          // The password is handed to the ssh2 client for this one connection attempt and is not
          // retained by this module afterwards (msg/password go out of scope with this handler).
        });
      }
    });

    ws.on("close", () => closeAll("client closed"));
    ws.on("error", () => closeAll("socket error"));
  });

  /** Call from the HTTP server's "upgrade" event. `req` must already carry an authenticated session. */
  function handleUpgrade(req: IncomingMessage & { cockpitUser?: string }, socket: Duplex, head: Buffer) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }

  return { handleUpgrade };
}

type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

function runStack(req: IncomingMessage, res: ServerResponse, mws: Middleware[], done: () => void) {
  let i = 0;
  const next = (err?: unknown) => {
    if (err) return done();
    const mw = mws[i++];
    if (!mw) return done();
    mw(req, res, next);
  };
  next();
}

/**
 * Wires the terminal's WebSocket onto an HTTP server's "upgrade" event at `path`. WS upgrades
 * bypass Express entirely, so the session/passport middleware is run by hand against the upgrade
 * request (with a stub response) to authenticate it the same way an HTTP request would be, before
 * the connection is accepted. Requests for any other path, or with a mismatched Origin, are
 * dropped so this never becomes an open relay for other upgrade traffic.
 */
export function attachTerminal(server: HttpServer, path: string, config: Config, authStack: Middleware[], audit: (who: string, action: string, detail: string) => void) {
  const terminal = createTerminalServer(config, audit);
  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "", "http://x").pathname !== path || req.headers.origin !== config.publicOrigin) {
      socket.destroy();
      return;
    }
    const res = new HttpServerResponse(req);
    runStack(req, res, authStack, () => {
      const authedReq = req as IncomingMessage & { isAuthenticated?: () => boolean; user?: { email: string }; cockpitUser?: string };
      // Re-check the allowlist here too: requireAuth() (which does this for HTTP routes) never
      // runs on an upgrade request, since upgrades bypass Express's routing entirely.
      if (!authedReq.isAuthenticated?.() || !authedReq.user || !isAllowedIdentity({ email: authedReq.user.email, emailVerified: true }, config.allowedEmail)) {
        socket.destroy();
        return;
      }
      authedReq.cockpitUser = authedReq.user.email;
      terminal.handleUpgrade(authedReq, socket, head);
    });
  });
  return terminal;
}

export type { Middleware as TerminalAuthMiddleware };
