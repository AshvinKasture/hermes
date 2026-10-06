import assert from "node:assert/strict";
import { before, test } from "node:test";
import passport from "passport";

process.env.GOOGLE_CLIENT_ID = "coverage-test-client";
process.env.GOOGLE_CLIENT_SECRET = "coverage-test-secret";
process.env.PUBLIC_URL = "https://jobs.example/jobs";

let strategy: any;

before(async () => {
  const { setupPassport } = await import("../src/auth/passport");
  setupPassport();
  strategy = (passport as any)._strategy("google");
});

function verifyProfile(profile: object) {
  return new Promise<{ id: string; name: string; email: string; picture: string }>((resolve, reject) => {
    strategy._verify("access-token", "refresh-token", profile, (error: unknown, user: unknown) => {
      if (error) reject(error);
      else resolve(user as { id: string; name: string; email: string; picture: string });
    });
  });
}

test("Google profile is mapped to the app user fields", async () => {
  const user = await verifyProfile({
    id: "google-id",
    displayName: "Example User",
    emails: [{ value: "allowed@example.com" }],
    photos: [{ value: "https://images.example/avatar.png" }],
  });
  assert.deepEqual(user, {
    id: "google-id",
    name: "Example User",
    email: "allowed@example.com",
    picture: "https://images.example/avatar.png",
  });
});

test("Google profile falls back to email prefix and empty picture", async () => {
  const user = await verifyProfile({
    id: "google-id-2",
    emails: [{ value: "fallback@example.com" }],
  });
  assert.equal(user.name, "fallback");
  assert.equal(user.picture, "");
});

test("Passport serialization and deserialization preserve the user object", async () => {
  const user = { id: "google-id", name: "Example", email: "allowed@example.com", picture: "" };
  const serializer = (passport as any)._serializers.at(-1);
  const deserializer = (passport as any)._deserializers.at(-1);
  const serialized = await new Promise((resolve, reject) => serializer(user, (error: unknown, value: unknown) => error ? reject(error) : resolve(value)));
  const deserialized = await new Promise((resolve, reject) => deserializer(serialized, (error: unknown, value: unknown) => error ? reject(error) : resolve(value)));
  assert.deepEqual(serialized, user);
  assert.deepEqual(deserialized, user);
});
