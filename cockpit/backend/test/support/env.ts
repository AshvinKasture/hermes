import type { Config } from "../../src/config";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    nodeEnv: "test",
    publicUrl: "https://cockpit.example/cockpit",
    publicOrigin: "https://cockpit.example",
    google: {
      clientID: "client-id",
      clientSecret: "client-secret",
      callbackURL: "https://cockpit.example/cockpit/auth/google/callback",
    },
    sessionSecret: "test-session-secret-test-session-secret",
    sessionDbPath: ":memory:",
    metricsDbPath: ":memory:",
    allowedEmail: "owner@example.com",
    frontendDist: undefined,
    ...overrides,
  };
}
