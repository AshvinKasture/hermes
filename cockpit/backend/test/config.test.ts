import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config";

const base = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  SESSION_SECRET: "x".repeat(40),
  ALLOWED_EMAIL: "Owner@Example.com",
  PUBLIC_URL: "https://h.example/cockpit/",
};

test("loads config, normalising email and public URL", () => {
  const c = loadConfig({ ...base });
  assert.equal(c.allowedEmail, "owner@example.com");
  assert.equal(c.publicUrl, "https://h.example/cockpit");
  assert.equal(c.publicOrigin, "https://h.example");
  assert.equal(c.google.callbackURL, "https://h.example/cockpit/auth/google/callback");
  assert.equal(c.port, 9200);
});

test("fails closed when ALLOWED_EMAIL is missing or blank", () => {
  assert.throws(() => loadConfig({ ...base, ALLOWED_EMAIL: "" }), /ALLOWED_EMAIL/);
  assert.throws(() => loadConfig({ ...base, ALLOWED_EMAIL: "   " }), /ALLOWED_EMAIL/);
  assert.throws(() => loadConfig({ ...base, ALLOWED_EMAIL: "not-an-email" }), /email address/);
});

test("requires OAuth credentials and a session secret", () => {
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"] as const) {
    assert.throws(() => loadConfig({ ...base, [key]: "" }), new RegExp(key));
  }
});

test("rejects a short session secret in production", () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: "production", SESSION_SECRET: "short" }), /32 characters/);
  assert.doesNotThrow(() => loadConfig({ ...base, NODE_ENV: "development", SESSION_SECRET: "short" }));
});
