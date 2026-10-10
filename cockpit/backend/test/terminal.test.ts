import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { after, before, test } from "node:test";
import { Server as SshServer, type Connection as SshConnection, utils as sshUtils } from "ssh2";
import { WebSocket } from "ws";
import { createApp } from "../src/app";
import { SqliteSessionStore } from "../src/auth/sqliteStore";
import { MetricsStore } from "../src/metrics/store";
import { attachTerminal } from "../src/terminal/ws";
import { testConfig } from "./support/env";

function signCookie(value: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  return encodeURIComponent(`s:${value}.${sig}`);
}

/** A minimal fake sshd: accepts `GOOD_PASSWORD` for any username, opens a session, and runs a
 *  trivial "shell" that echoes whatever it's sent, so the WS<->SSH<->PTY bridge can be exercised
 *  without touching the real host SSH. */
const GOOD_PASSWORD = "correct horse battery staple";

function startFakeSshd(): Promise<{ server: SshServer; port: number }> {
  return new Promise((resolve) => {
    const hostKey = sshUtils.generateKeyPairSync("ed25519");
    const server = new SshServer({ hostKeys: [hostKey.private] }, (client: SshConnection) => {
      client.on("authentication", (ctx) => {
        if (ctx.method === "password" && ctx.password === GOOD_PASSWORD) ctx.accept();
        else ctx.reject(["password"]);
      });
      client.on("ready", () => {
        client.on("session", (accept) => {
          const session = accept();
          session.on("pty", (accept2: () => void) => accept2?.());
          session.on("shell", (accept2: () => NodeJS.ReadWriteStream) => {
            const stream = accept2();
            stream.write("welcome\r\n");
            stream.on("data", (d: Buffer) => stream.write(`echo:${d.toString("utf8")}`));
          });
        });
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === "object" && addr ? addr.port : 0 });
    });
  });
}

let sshd: { server: SshServer; port: number };
let httpServer: HttpServer;
let base: string;
let wsBase: string;
let store: SqliteSessionStore;
const cfg = () => testConfig({ terminal: { host: "127.0.0.1", port: sshd.port, user: "ashvin", idleTimeoutMs: 15 * 60 * 1000 } });

before(async () => {
  sshd = await startFakeSshd();
  store = new SqliteSessionStore(":memory:");
  const app = createApp(cfg(), { sessionStore: store, metricsStore: new MetricsStore(":memory:") });
  httpServer = app.listen(0);
  await new Promise<void>((r) => httpServer.once("listening", r));
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
  wsBase = `ws://127.0.0.1:${addr.port}`;

  // The terminal's own copy of the session stack, same as index.ts wires up.
  const { buildAuthMiddleware } = await import("../src/app");
  const { stack } = buildAuthMiddleware(cfg(), store);
  attachTerminal(httpServer, "/cockpit/api/terminal", cfg(), stack, () => {});
});

after(() => {
  httpServer.close();
  sshd.server.close();
  store.close();
});

async function authedCookie(email = "owner@example.com") {
  const sid = `sid-${Math.random()}`;
  const user = { id: "1", name: "Owner", email, picture: "" };
  await new Promise<void>((resolve) =>
    store.set(sid, { cookie: { expires: new Date(Date.now() + 60_000), originalMaxAge: 60_000 }, passport: { user } } as never, () => resolve())
  );
  return `cockpit.sid=${signCookie(sid, cfg().sessionSecret)}`;
}

function waitFor(ws: WebSocket, predicate: (msg: Record<string, unknown>) => boolean, timeoutMs = 4000): Promise<Record<string, unknown>> {
  // Messages can arrive back-to-back (same TCP read) before the next `await waitFor(...)` call
  // has registered its listener, so every message is buffered from attachMessageBuffer() time and
  // this searches the backlog first, falling back to new arrivals.
  const buf = messageBuffers.get(ws) ?? [];
  const already = buf.find(predicate);
  if (already) {
    buf.splice(buf.indexOf(already), 1);
    return Promise.resolve(already);
  }
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    const onMsg = (raw: Buffer | string) => {
      const msg = JSON.parse(raw.toString());
      if (predicate(msg)) {
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

const messageBuffers = new WeakMap<WebSocket, Record<string, unknown>[]>();

/** Start buffering every message for `waitFor` to search, from connection time onward. */
function bufferMessages(ws: WebSocket) {
  const buf: Record<string, unknown>[] = [];
  messageBuffers.set(ws, buf);
  ws.on("message", (raw: Buffer | string) => buf.push(JSON.parse(raw.toString())));
}

test("rejects the upgrade without a session cookie", async () => {
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { origin: "https://cockpit.example" } });
  const closed = await new Promise<{ code: number }>((resolve) => {
    ws.on("unexpected-response", (_req, res) => resolve({ code: res.statusCode ?? 0 }));
    ws.on("close", (code) => resolve({ code }));
    ws.on("error", () => resolve({ code: -1 }));
  });
  assert.notEqual(closed.code, 1000);
});

test("rejects an upgrade from a foreign Origin even with a valid cookie", async () => {
  const cookie = await authedCookie();
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://evil.example" } });
  const result = await new Promise<string>((resolve) => {
    ws.on("open", () => resolve("open"));
    ws.on("unexpected-response", () => resolve("rejected"));
    ws.on("error", () => resolve("error"));
    ws.on("close", () => resolve("closed"));
  });
  assert.notEqual(result, "open");
});

test("rejects a session for a different (not-allowed) email", async () => {
  const cookie = await authedCookie("someone-else@example.com");
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  const result = await new Promise<string>((resolve) => {
    ws.on("open", () => resolve("open"));
    ws.on("unexpected-response", () => resolve("rejected"));
    ws.on("error", () => resolve("error"));
    ws.on("close", () => resolve("closed"));
  });
  assert.notEqual(result, "open");
});

test("wrong SSH password is rejected and the socket is closed, without starting a shell", async () => {
  const cookie = await authedCookie();
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  bufferMessages(ws);
  await new Promise<void>((resolve, reject) => ws.on("open", () => resolve()).on("error", reject));
  ws.send(JSON.stringify({ type: "auth", password: "definitely wrong", cols: 80, rows: 24 }));
  const err = await waitFor(ws, (m) => m.type === "error");
  assert.match(String(err.text), /wrong password/i);
  await new Promise<void>((resolve) => ws.on("close", () => resolve()));
});

test("correct password opens a real PTY session end to end: welcome banner, echo, resize, close", async () => {
  const cookie = await authedCookie();
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  bufferMessages(ws);
  await new Promise<void>((resolve, reject) => ws.on("open", () => resolve()).on("error", reject));
  ws.send(JSON.stringify({ type: "auth", password: GOOD_PASSWORD, cols: 80, rows: 24 }));
  await waitFor(ws, (m) => m.type === "ready");
  const banner = await waitFor(ws, (m) => m.type === "data" && String(m.data).includes("welcome"));
  assert.match(String(banner.data), /welcome/);

  ws.send(JSON.stringify({ type: "data", data: "ls\n" }));
  const echoed = await waitFor(ws, (m) => m.type === "data" && String(m.data).includes("echo:ls"));
  assert.match(String(echoed.data), /echo:ls/);

  // Resize doesn't error and doesn't close the connection.
  ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
  ws.send(JSON.stringify({ type: "data", data: "still here\n" }));
  await waitFor(ws, (m) => m.type === "data" && String(m.data).includes("still here"));

  ws.close();
  await new Promise<void>((resolve) => ws.on("close", () => resolve()));
});

test("a second auth message on an already-authenticated socket is ignored", async () => {
  const cookie = await authedCookie();
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  bufferMessages(ws);
  await new Promise<void>((resolve, reject) => ws.on("open", () => resolve()).on("error", reject));
  ws.send(JSON.stringify({ type: "auth", password: GOOD_PASSWORD, cols: 80, rows: 24 }));
  await waitFor(ws, (m) => m.type === "ready");
  ws.send(JSON.stringify({ type: "auth", password: "anything", cols: 80, rows: 24 }));
  // The connection must stay open and usable — a second auth attempt is a no-op, not an error.
  ws.send(JSON.stringify({ type: "data", data: "ping\n" }));
  const echoed = await waitFor(ws, (m) => m.type === "data" && String(m.data).includes("echo:ping"));
  assert.match(String(echoed.data), /echo:ping/);
  ws.close();
  await new Promise<void>((resolve) => ws.on("close", () => resolve()));
});

test("garbage frames and an empty password are ignored without crashing the connection", async () => {
  const cookie = await authedCookie();
  const ws = new WebSocket(`${wsBase}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  bufferMessages(ws);
  await new Promise<void>((resolve, reject) => ws.on("open", () => resolve()).on("error", reject));
  ws.send("not json");
  ws.send(JSON.stringify({ type: "auth", password: "", cols: 80, rows: 24 }));
  const err = await waitFor(ws, (m) => m.type === "error");
  assert.match(String(err.text), /password required/i);
  // The socket is still usable afterwards.
  ws.send(JSON.stringify({ type: "auth", password: GOOD_PASSWORD, cols: 80, rows: 24 }));
  await waitFor(ws, (m) => m.type === "ready");
  ws.close();
  await new Promise<void>((resolve) => ws.on("close", () => resolve()));
});

test("idle timeout closes the socket and tells the user why", async () => {
  const shortCfg = testConfig({ terminal: { host: "127.0.0.1", port: sshd.port, user: "ashvin", idleTimeoutMs: 200 } });
  const { buildAuthMiddleware } = await import("../src/app");
  const localStore = new SqliteSessionStore(":memory:");
  const app = createApp(shortCfg, { sessionStore: localStore, metricsStore: new MetricsStore(":memory:") });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const { stack } = buildAuthMiddleware(shortCfg, localStore);
  attachTerminal(server, "/cockpit/api/terminal", shortCfg, stack, () => {});
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");

  const sid = "idle-sid";
  const user = { id: "1", name: "Owner", email: "owner@example.com", picture: "" };
  await new Promise<void>((resolve) => localStore.set(sid, { cookie: { expires: new Date(Date.now() + 60_000), originalMaxAge: 60_000 }, passport: { user } } as never, () => resolve()));
  const cookie = `cockpit.sid=${signCookie(sid, shortCfg.sessionSecret)}`;

  const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/cockpit/api/terminal`, { headers: { cookie, origin: "https://cockpit.example" } });
  await new Promise<void>((resolve, reject) => ws.on("open", () => resolve()).on("error", reject));
  const closeCode = await new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
  assert.equal(closeCode, 4000);
  server.close();
  localStore.close();
});
