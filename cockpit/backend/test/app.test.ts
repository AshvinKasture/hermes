import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import session from "express-session";
import { createApp } from "../src/app";
import { SqliteSessionStore } from "../src/auth/sqliteStore";
import { testConfig } from "./support/env";

let server: Server;
let base: string;
let store: SqliteSessionStore;
let dist: string;
const cfg = () => testConfig({ frontendDist: dist });

before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-test-"));
  fs.writeFileSync(path.join(dist, "index.html"), "<main>cockpit shell</main>");
  store = new SqliteSessionStore(":memory:");
  const app = createApp(cfg(), store as session.Store);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test("healthz is public", async () => {
  const res = await fetch(`${base}/cockpit/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("API requires authentication", async () => {
  const res = await fetch(`${base}/cockpit/api/me`);
  assert.equal(res.status, 401);
});

test("unknown API paths are not served the SPA and need auth", async () => {
  const res = await fetch(`${base}/cockpit/api/does-not-exist`);
  assert.equal(res.status, 401);
});

test("login redirects to Google with an account chooser", async () => {
  const res = await fetch(`${base}/cockpit/auth/google`, { redirect: "manual" });
  assert.equal(res.status, 302);
  const loc = res.headers.get("location") ?? "";
  assert.match(loc, /^https:\/\/accounts\.google\.com\//);
  assert.match(loc, /client_id=client-id/);
  assert.ok(decodeURIComponent(loc).includes("redirect_uri=https://cockpit.example/cockpit/auth/google/callback"));
});

test("state-changing requests need a matching Origin", async () => {
  const bad = await fetch(`${base}/cockpit/auth/logout`, { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  const none = await fetch(`${base}/cockpit/auth/logout`, { method: "POST" });
  assert.equal(none.status, 403);
  const ok = await fetch(`${base}/cockpit/auth/logout`, { method: "POST", headers: { origin: "https://cockpit.example" } });
  assert.equal(ok.status, 200);
});

test("serves the SPA shell for client routes and static assets", async () => {
  const res = await fetch(`${base}/cockpit/files/some/path`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /cockpit shell/);
});

test("sets security headers and hides x-powered-by", async () => {
  const res = await fetch(`${base}/cockpit/healthz`);
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.ok(res.headers.get("x-content-type-options"));
});

test("authenticated session passes the API gate; changed allowlist blocks it", async () => {
  // Forge a stored session for the allowed user, as passport would after login.
  const sid = "forged-sid";
  const user = { id: "1", name: "Owner", email: "owner@example.com", picture: "" };
  await new Promise<void>((resolve) =>
    store.set(sid, { cookie: { expires: new Date(Date.now() + 60_000), originalMaxAge: 60_000 }, passport: { user } } as never, () => resolve())
  );
  const signed = signCookie(sid, cfg().sessionSecret);
  const ok = await fetch(`${base}/cockpit/api/me`, { headers: { cookie: `cockpit.sid=${signed}` } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { name: "Owner", email: "owner@example.com", picture: "" });

  // A session for any other email is rejected even though it is authenticated.
  const sid2 = "other-sid";
  await new Promise<void>((resolve) =>
    store.set(sid2, { cookie: { expires: new Date(Date.now() + 60_000), originalMaxAge: 60_000 }, passport: { user: { ...user, email: "other@example.com" } } } as never, () => resolve())
  );
  const denied = await fetch(`${base}/cockpit/api/me`, { headers: { cookie: `cockpit.sid=${signCookie(sid2, cfg().sessionSecret)}` } });
  assert.equal(denied.status, 403);
});

import crypto from "node:crypto";
function signCookie(value: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  return encodeURIComponent(`s:${value}.${sig}`);
}
