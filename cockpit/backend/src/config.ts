export interface Config {
  port: number;
  nodeEnv: string;
  publicUrl: string;
  publicOrigin: string;
  google: { clientID: string; clientSecret: string; callbackURL: string };
  sessionSecret: string;
  sessionDbPath: string;
  allowedEmail: string;
  frontendDist: string | undefined;
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
    allowedEmail,
    frontendDist: env.FRONTEND_DIST || undefined,
  };
}
