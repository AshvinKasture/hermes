import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type session from "express-session";
import { createApp } from "../src/app";
import { SqliteSessionStore } from "../src/auth/sqliteStore";
import { FileService } from "../src/fs/service";
import { contentDisposition } from "../src/routes/fs";
import { MetricsStore } from "../src/metrics/store";
import { testConfig } from "./support/env";

let server: Server;
let base: string;
let cookie: string;
let root: string;
let metrics: MetricsStore;
const HOME = "/home/ashvin";
const cfg = testConfig({ fs: { root: "/", home: HOME, maxEditBytes: 64 * 1024, maxUploadBytes: 10 * 1024 } });
const R = (v: string) => path.join(root, v);

const sign = (v: string) =>
  encodeURIComponent(`s:${v}.${crypto.createHmac("sha256", cfg.sessionSecret).update(v).digest("base64").replace(/=+$/, "")}`);

const url = (p: string) => `${base}/cockpit/api/fs${p}`;
const enc = encodeURIComponent;
const get = (p: string, c = cookie) => fetch(url(p), { headers: c ? { cookie: c } : {} });
const send = (method: string, p: string, body?: unknown, origin = cfg.publicOrigin) =>
  fetch(url(p), { method, headers: { cookie, origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-fsapi-"));
  fs.mkdirSync(R("home/ashvin/docs"), { recursive: true });
  fs.mkdirSync(R("etc"), { recursive: true });
  fs.writeFileSync(R("home/ashvin/hello.txt"), "hello");
  fs.writeFileSync(R("etc/hosts"), "127.0.0.1 localhost");
  fs.writeFileSync(R("home/ashvin/ünï \"q\".txt"), "x");

  const sessions = new SqliteSessionStore(":memory:");
  await new Promise<void>((resolve) =>
    sessions.set(
      "sid",
      { cookie: { expires: new Date(Date.now() + 600_000), originalMaxAge: 600_000 }, passport: { user: { id: "1", name: "O", email: cfg.allowedEmail, picture: "" } } } as never,
      () => resolve()
    )
  );
  cookie = `cockpit.sid=${sign("sid")}`;
  metrics = new MetricsStore(":memory:");
  const app = createApp(cfg, {
    sessionStore: sessions as session.Store,
    metricsStore: metrics,
    fileService: new FileService({ ...cfg.fs, root }),
  });
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  server.close();
  metrics.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("every file endpoint requires authentication", async () => {
  for (const [m, p] of [["GET", "/info"], ["GET", `/list?path=${enc(HOME)}`], ["GET", `/read?path=${enc(HOME)}/hello.txt`], ["GET", `/download?path=${enc(HOME)}/hello.txt`], ["GET", `/search?path=/&q=a`]]) {
    const res = await fetch(url(p), { method: m });
    assert.equal(res.status, 401, p);
  }
  for (const [m, p] of [["PUT", "/write"], ["POST", "/create"], ["POST", "/rename"], ["POST", "/delete"], ["PUT", "/upload"]]) {
    const res = await fetch(url(p), { method: m, headers: { origin: cfg.publicOrigin, "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401, p);
  }
});

test("state-changing file calls are blocked from a foreign origin", async () => {
  const res = await send("POST", "/delete", { path: `${HOME}/hello.txt` }, "https://evil.example");
  assert.equal(res.status, 403);
  assert.equal(fs.existsSync(R("home/ashvin/hello.txt")), true);
  const w = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: "x" }, "https://evil.example");
  assert.equal(w.status, 403);
});

test("info, list and read", async () => {
  const info = (await (await get("/info")).json()) as { home: string };
  assert.equal(info.home, HOME);
  const list = (await (await get(`/list?path=${enc(HOME)}`)).json()) as { entries: { name: string }[]; writable: boolean };
  assert.equal(list.writable, true);
  assert.ok(list.entries.some((e) => e.name === "hello.txt"));
  const file = (await (await get(`/read?path=${enc(HOME + "/hello.txt")}`)).json()) as { content: string; etag: string };
  assert.equal(file.content, "hello");
  assert.ok(file.etag);
});

test("errors are returned as JSON with a code", async () => {
  const missing = await get(`/list?path=${enc("/nope")}`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "No such file or directory", code: "not_found" });
  const bad = await get("/list");
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { code: string }).code, "invalid_path");
  assert.equal((await get(`/list?path=${enc("rel/path")}`)).status, 400);
});

test("path traversal cannot read outside the root", async () => {
  const res = await get(`/read?path=${enc("/home/ashvin/../../../../etc/hosts")}`);
  const body = (await res.json()) as { path: string; content: string };
  assert.equal(body.path, "/etc/hosts"); // clamped inside the mounted root, and it is the fake one
  assert.equal(body.content, "127.0.0.1 localhost");
});

test("write → conflict → read-only enforcement", async () => {
  const f = (await (await get(`/read?path=${enc(HOME + "/hello.txt")}`)).json()) as { etag: string };
  const ok = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: "v2", etag: f.etag });
  assert.equal(ok.status, 200);
  assert.equal(fs.readFileSync(R("home/ashvin/hello.txt"), "utf8"), "v2");
  const stale = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: "v3", etag: f.etag });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { code: string }).code, "conflict");
  const ro = await send("PUT", "/write", { path: "/etc/hosts", content: "pwned" });
  assert.equal(ro.status, 403);
  assert.equal(fs.readFileSync(R("etc/hosts"), "utf8"), "127.0.0.1 localhost");
});

test("saving a file larger than the 1 MB default JSON limit works up to the edit cap", async () => {
  const big = "a".repeat(60 * 1024);
  const res = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: big });
  assert.equal(res.status, 200);
  const tooBig = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: "a".repeat(70 * 1024) });
  assert.equal(tooBig.status, 413);
  const huge = await send("PUT", "/write", { path: `${HOME}/hello.txt`, content: "a".repeat(400 * 1024) });
  assert.equal(huge.status, 413);
  assert.equal(((await huge.json()) as { code: string }).code, "too_large");
});

test("invalid JSON is a 400", async () => {
  const res = await fetch(url("/write"), { method: "PUT", headers: { cookie, origin: cfg.publicOrigin, "content-type": "application/json" }, body: "{not json" });
  assert.equal(res.status, 400);
});

test("create, rename, trash", async () => {
  const c = await send("POST", "/create", { dir: `${HOME}/docs`, name: "n.txt", type: "file" });
  assert.equal(c.status, 201);
  assert.equal((await send("POST", "/create", { dir: `${HOME}/docs`, name: "n.txt", type: "file" })).status, 409);
  const r = await send("POST", "/rename", { from: `${HOME}/docs/n.txt`, to: `${HOME}/docs/m.txt` });
  assert.equal(r.status, 200);
  const d = await send("POST", "/delete", { path: `${HOME}/docs/m.txt` });
  assert.equal(d.status, 200);
  assert.equal(((await d.json()) as { trashed: boolean }).trashed, true);
  assert.equal(fs.existsSync(R("home/ashvin/.local/share/Trash/files/m.txt")), true);
  assert.equal((await send("POST", "/delete", { path: "/etc/hosts" })).status, 403);
  assert.equal((await send("POST", "/delete", { path: HOME })).status, 400);
});

test("download sends a safe attachment header, including for awkward names", async () => {
  const res = await get(`/download?path=${enc(HOME + '/ünï "q".txt')}`);
  assert.equal(res.status, 200);
  const cd = res.headers.get("content-disposition") ?? "";
  assert.match(cd, /^attachment; filename="[^"\\]*"; filename\*=UTF-8''/);
  assert.ok(cd.includes(enc('ünï "q".txt')));
  assert.equal(await res.text(), "x");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await get(`/download?path=${enc(HOME)}`)).status, 400);
  assert.equal(contentDisposition("a.txt"), `attachment; filename="a.txt"; filename*=UTF-8''a.txt`);
});

test("upload: raw body, no overwrite by default, size limit", async () => {
  const up = (name: string, body: string | Buffer, extra = "") =>
    fetch(url(`/upload?dir=${enc(HOME + "/docs")}&name=${enc(name)}${extra}`), { method: "PUT", headers: { cookie, origin: cfg.publicOrigin, "content-type": "application/octet-stream" }, body });
  assert.equal((await up("u.txt", "abc")).status, 201);
  assert.equal(fs.readFileSync(R("home/ashvin/docs/u.txt"), "utf8"), "abc");
  assert.equal((await up("u.txt", "zzz")).status, 409);
  assert.equal((await up("u.txt", "new", "&overwrite=1")).status, 201);
  assert.equal(fs.readFileSync(R("home/ashvin/docs/u.txt"), "utf8"), "new");
  const big = await up("big.bin", Buffer.alloc(20 * 1024));
  assert.equal(big.status, 413);
  assert.equal(fs.existsSync(R("home/ashvin/docs/big.bin")), false);
  assert.equal((await up("../evil", "x")).status, 400);
});

test("search", async () => {
  const r = (await (await get(`/search?path=${enc(HOME)}&q=hello`)).json()) as { results: { path: string }[] };
  assert.equal(r.results[0].path, `${HOME}/hello.txt`);
  assert.equal((await get(`/search?path=${enc(HOME)}`)).status, 400);
});
