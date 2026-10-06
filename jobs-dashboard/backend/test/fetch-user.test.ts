import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchUser } from "../../frontend/src/hooks/useJobs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchUser treats an unauthenticated response as a signed-out user", async () => {
  globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
  assert.equal(await fetchUser(), null);
});

test("fetchUser surfaces access-denied responses instead of treating them as signed out", async () => {
  globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
  await assert.rejects(fetchUser(), /HTTP 403/);
});
