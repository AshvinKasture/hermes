export interface Config {
  port: number;
  nodeEnv: string;
  publicUrl: string;
  publicOrigin: string;
  google: { clientID: string; clientSecret: string; callbackURL: string };
  sessionSecret: string;
  sessionDbPath: string;
  metricsDbPath: string;
  allowedEmail: string;
  frontendDist: string | undefined;
  fs: { root: string; home: string; maxEditBytes: number; maxUploadBytes: number };
  terminal: { host: string; port: number; user: string; idleTimeoutMs: number };
}

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = (env[name] ?? "").trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/**
 * Build configuration from the environment. Fails closed: the server refuses
 * to start unless OAuth credentials, a session secret and the single allowed
 * email are all present, so access can never default to "everyone".
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || "development";
  const publicUrl = (env.PUBLIC_URL || "http://localhost:9200").replace(/\/+$/, "");
  const sessionSecret = required(env, "SESSION_SECRET");
  if (nodeEnv === "production" && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  const allowedEmail = required(env, "ALLOWED_EMAIL").toLowerCase();
  if (!allowedEmail.includes("@")) throw new Error("ALLOWED_EMAIL must be an email address");

  return {
    port: parseInt(env.PORT || "9200", 10),
    nodeEnv,
    publicUrl,
    publicOrigin: new URL(publicUrl).origin,
    google: {
      clientID: required(env, "GOOGLE_CLIENT_ID"),
      clientSecret: required(env, "GOOGLE_CLIENT_SECRET"),
      callbackURL: `${publicUrl}/auth/google/callback`,
    },
    sessionSecret,
    sessionDbPath: env.SESSION_DB_PATH || "/data/cockpit.db",
    metricsDbPath: env.METRICS_DB_PATH || env.SESSION_DB_PATH || "/data/cockpit.db",
    allowedEmail,
    frontendDist: env.FRONTEND_DIST || undefined,
    fs: {
      // Where the host filesystem is visible to this process ("/host" in Docker).
      root: env.FS_ROOT || "/",
      // The only read-write zone; the rest of the filesystem is read-only.
      home: (env.FS_HOME || "/home/ashvin").replace(/\/+$/, "") || "/home/ashvin",
      maxEditBytes: intEnv(env, "FS_MAX_EDIT_BYTES", 5 * 1024 * 1024),
      maxUploadBytes: intEnv(env, "FS_MAX_UPLOAD_BYTES", 200 * 1024 * 1024),
    },
    terminal: {
      // The container reaches the host's own sshd to get a real login shell as ashvin.
      // host.docker.internal is mapped to the bridge gateway via extra_hosts in compose.
      host: env.TERMINAL_SSH_HOST || "host.docker.internal",
      port: intEnv(env, "TERMINAL_SSH_PORT", 22),
      user: env.TERMINAL_SSH_USER || "ashvin",
      idleTimeoutMs: intEnv(env, "TERMINAL_IDLE_TIMEOUT_MS", 15 * 60 * 1000),
    },
  };
}
