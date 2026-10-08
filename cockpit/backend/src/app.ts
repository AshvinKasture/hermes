import express, { type Express } from "express";
import session from "express-session";
import helmet from "helmet";
import passport from "passport";
import rateLimit from "express-rate-limit";
import path from "node:path";
import type { Config } from "./config";
import { requireAuth, requireSameOrigin } from "./auth/middleware";
import { setupPassport } from "./auth/passport";
import { SqliteSessionStore } from "./auth/sqliteStore";

export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function createApp(config: Config, store: session.Store = new SqliteSessionStore(config.sessionDbPath)): Express {
  const app = express();
  const isProd = config.nodeEnv === "production";
  const cookiePath = new URL(config.publicUrl).pathname || "/";

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Caddy sits in front

  app.use(helmet());
  app.use(
    session({
      name: "cockpit.sid",
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: "lax",
        path: cookiePath,
        maxAge: SESSION_MAX_AGE_MS,
      },
    })
  );

  setupPassport(config);
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(express.json({ limit: "1mb" }));
  app.use(requireSameOrigin(config));

  // Everything below is mounted under the public base path (e.g. /cockpit). Caddy forwards
  // the prefix unstripped so express-session's cookie-path check sees the real URL.
  const root = express.Router();
  app.use(cookiePath === "/" ? "/" : cookiePath, root);

  root.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ── Auth routes ──
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
  root.get("/auth/google", authLimiter, passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" }));
  root.get(
    "/auth/google/callback",
    authLimiter,
    passport.authenticate("google", { failureRedirect: `${config.publicUrl}/?error=denied` }),
    (_req, res) => {
      res.redirect(`${config.publicUrl}/`);
    }
  );
  root.post("/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("cockpit.sid", { path: cookiePath });
        res.json({ ok: true });
      });
    });
  });

  // ── API (everything under /api requires auth) ──
  const api = express.Router();
  api.use(requireAuth(config));
  api.get("/me", (req, res) => {
    const { name, email, picture } = req.user!;
    res.json({ name, email, picture });
  });
  root.use("/api", api);

  // ── Frontend ──
  if (config.frontendDist) {
    const dist = config.frontendDist;
    root.use(express.static(dist));
    root.get(/^\/(?!api\/|auth\/).*/, (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  return app;
}
