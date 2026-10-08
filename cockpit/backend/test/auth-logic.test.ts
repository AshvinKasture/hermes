import assert from "node:assert/strict";
import { test } from "node:test";
import type { Profile } from "passport-google-oauth20";
import { isAllowedIdentity } from "../src/auth/allowlist";
import { makeVerify, profileToIdentity } from "../src/auth/passport";
import { testConfig } from "./support/env";

test("allowlist accepts only the verified allowed email (case-insensitive)", () => {
  assert.equal(isAllowedIdentity({ email: "Owner@Example.com", emailVerified: true }, "owner@example.com"), true);
  assert.equal(isAllowedIdentity({ email: "owner@example.com", emailVerified: false }, "owner@example.com"), false);
  assert.equal(isAllowedIdentity({ email: "other@example.com", emailVerified: true }, "owner@example.com"), false);
});

test("allowlist denies everyone when no email is configured", () => {
  assert.equal(isAllowedIdentity({ email: "", emailVerified: true }, ""), false);
  assert.equal(isAllowedIdentity({ email: "a@b.c", emailVerified: true }, ""), false);
});

function profile(email: string, verified: boolean | string): Profile {
  return {
    id: "123",
    displayName: "Owner",
    emails: [{ value: email }],
    photos: [{ value: "http://pic" }],
    _json: { email_verified: verified },
  } as unknown as Profile;
}

test("profileToIdentity reads email_verified as boolean or string", () => {
  assert.deepEqual(profileToIdentity(profile("a@b.c", true)), { email: "a@b.c", emailVerified: true });
  assert.equal(profileToIdentity(profile("a@b.c", "true")).emailVerified, true);
  assert.equal(profileToIdentity(profile("a@b.c", false)).emailVerified, false);
  assert.deepEqual(profileToIdentity({ id: "1" } as Profile), { email: "", emailVerified: false });
});

test("verify callback creates a user only for the allowed identity", () => {
  const verify = makeVerify(testConfig());
  let result: unknown = "unset";
  verify("a", "r", profile("owner@example.com", true), (_e, u) => (result = u));
  assert.deepEqual(result, { id: "123", name: "Owner", email: "owner@example.com", picture: "http://pic" });

  const warn = console.warn;
  console.warn = () => {};
  try {
    verify("a", "r", profile("intruder@example.com", true), (_e, u) => (result = u));
    assert.equal(result, false);
    verify("a", "r", profile("owner@example.com", false), (_e, u) => (result = u));
    assert.equal(result, false);
  } finally {
    console.warn = warn;
  }
});
