import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionData } from "express-session";
import { SqliteSessionStore } from "../src/auth/sqliteStore";

const sess = (expires: Date): SessionData =>
  ({ cookie: { expires, originalMaxAge: 1000 }, passport: { user: "x" } }) as unknown as SessionData;

const call = <T>(fn: (cb: (err?: unknown, v?: T) => void) => void) =>
  new Promise<T | undefined>((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))));

test("stores, reads, touches and destroys sessions", async () => {
  const store = new SqliteSessionStore(":memory:");
  const future = new Date(Date.now() + 60_000);
  await call((cb) => store.set("s1", sess(future), cb));
  const got = (await call<SessionData | null>((cb) => store.get("s1", cb))) as unknown as { passport: unknown };
  assert.deepEqual(got.passport, { user: "x" });

  await call((cb) => store.touch("s1", sess(new Date(Date.now() + 120_000)), cb));
  await call((cb) => store.destroy("s1", cb));
  assert.equal(await call((cb) => store.get("s1", cb)), null);
  store.close();
});

test("expired and unknown sessions are not returned", async () => {
  const store = new SqliteSessionStore(":memory:");
  await call((cb) => store.set("old", sess(new Date(Date.now() - 1000)), cb));
  assert.equal(await call((cb) => store.get("old", cb)), null);
  assert.equal(await call((cb) => store.get("missing", cb)), null);
  store.close();
});

test("sessions without an expiry get a default lifetime", async () => {
  const store = new SqliteSessionStore(":memory:");
  await call((cb) => store.set("n", { cookie: {} } as unknown as SessionData, cb));
  assert.notEqual(await call((cb) => store.get("n", cb)), null);
  store.close();
});
