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
import { MetricsCollector } from "./metrics/collector";
import { MetricsStore } from "./metrics/store";
import { metricsRouter } from "./routes/metrics";
import { settingsRouter } from "./routes/settings";
import { FileService } from "./fs/service";
import { fsErrorHandler, fsRouter } from "./routes/fs";

export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface AppDeps {
  sessionStore?: session.Store;
  collector?: MetricsCollector;
  metricsStore: MetricsStore;
  fileService?: FileService;
}

/** The session + passport middleware stack, needed by both the HTTP app and the terminal's
 *  WebSocket upgrade (which never goes through Express's normal request pipeline). */
export function buildAuthMiddleware(config: Config, store: session.Store) {
  const cookiePath = new URL(config.publicUrl).pathname || "/";
  const isProd = config.nodeEnv === "production";
  setupPassport(config);
  return {
    cookiePath,
    stack: [
      session({
        name: "cockpit.sid",
        secret: config.sessionSecret,
        store,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: isProd, httpOnly: true, sameSite: "lax", path: cookiePath, maxAge: SESSION_MAX_AGE_MS },
      }),
      passport.initialize(),
      passport.session(),
    ],
  };
}

export function createApp(config: Config, deps: AppDeps): Express {
  const store = deps.sessionStore ?? new SqliteSessionStore(config.sessionDbPath);
  const collector = deps.collector ?? new MetricsCollector();
  const files = deps.fileService ?? new FileService(config.fs);
  const app = express();
  const { cookiePath, stack } = buildAuthMiddleware(config, store);

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Caddy sits in front

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Google profile pictures are served from *.googleusercontent.com
          "img-src": ["'self'", "data:", "https://*.googleusercontent.com"],
        },
      },
    })
  );
  stack.forEach((mw) => app.use(mw));

  const smallJson = express.json({ limit: "1mb" });
  // The file-save route parses its own (larger) body, so skip it here.
  app.use((req, res, next) => (req.path.endsWith("/api/fs/write") ? next() : smallJson(req, res, next)));
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
  api.use("/metrics", metricsRouter(collector, deps.metricsStore));
  api.use("/settings", settingsRouter(deps.metricsStore));
  api.use("/fs", fsRouter(files));
  api.use(fsErrorHandler);
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
