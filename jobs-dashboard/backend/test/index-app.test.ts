import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { Server } from "node:http";

let staticDir: string;
let server: Server;
let baseUrl: string;
let app: import("express").Express;
let startServer: (port?: number) => Server;

before(async () => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "jobs-dashboard-web-tests-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<main>dashboard shell</main>");
  fs.writeFileSync(path.join(staticDir, "health.txt"), "static asset");

  process.env.PORT = "0";
  process.env.NODE_ENV = "production";
  process.env.DB_PATH = path.join(staticDir, "unused.sqlite");
  process.env.GOOGLE_CLIENT_ID = "integration-test-client";
  process.env.GOOGLE_CLIENT_SECRET = "integration-test-secret";
  process.env.SESSION_SECRET = "integration-test-session-secret";
  process.env.ALLOWED_EMAIL = "allowed@example.com";
  process.env.PUBLIC_URL = "https://jobs.example/jobs";
  process.env.FRONTEND_DIST = staticDir;

  const module = await import("../src/index");
  app = module.default;
  startServer = module.startServer;
  assert.equal(app.get("trust proxy"), 1);
  server = startServer(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test app did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  if (staticDir) fs.rmSync(staticDir, { recursive: true, force: true });
});

test("Express serves static files and falls back to the SPA document", async () => {
  const asset = await fetch(`${baseUrl}/health.txt`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "static asset");

  const deepLink = await fetch(`${baseUrl}/jobs/deep/link`);
  assert.equal(deepLink.status, 200);
  assert.match(await deepLink.text(), /dashboard shell/);
});

test("auth and API routes reject requests without a session", async () => {
  const user = await fetch(`${baseUrl}/auth/user`);
  assert.equal(user.status, 401);
  const jobs = await fetch(`${baseUrl}/api/jobs`);
  assert.equal(jobs.status, 401);
});

test("OAuth initiation redirects to Google's authorization endpoint", async () => {
  const response = await fetch(`${baseUrl}/auth/google`, {
    redirect: "manual",
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /^https:\/\/accounts\.google\.com\//);
});

test("CORS handles an allowed preflight and JSON logout responds", async () => {
  const preflight = await fetch(`${baseUrl}/auth/user`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://jobs.example",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://jobs.example");

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { success: true });
});
