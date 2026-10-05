export const config = {
  port: parseInt(process.env.PORT || "9120", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  dbPath: process.env.DB_PATH || "/data/job_openings.db",
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: `${process.env.PUBLIC_URL || "http://localhost:9120"}/auth/google/callback`,
  },
  session: {
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  },
  allowedEmail: process.env.ALLOWED_EMAIL || "",
  publicUrl: process.env.PUBLIC_URL || "http://localhost:9120",
} as const;

export type Config = typeof config;