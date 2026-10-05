import express from "express";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { setupPassport } from "./auth/passport";
import { requireAuth, requireAllowedEmail } from "./auth/middleware";
import authRoutes from "./routes/auth";
import jobsRoutes from "./routes/jobs";

const app = express();

// ── Trust proxy (Caddy sits in front) ──
app.set("trust proxy", 1);

// ── Session ──
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.nodeEnv === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

// ── Passport ──
setupPassport();
app.use(passport.initialize());
app.use(passport.session());

// ── CORS ──
app.use(cors({ origin: config.publicUrl, credentials: true }));

// ── Body parsing ──
app.use(express.json());

// ── Auth routes (no auth required) ──
app.use("/auth", authRoutes);

// ── API routes (auth + email check required) ──
app.use("/api/jobs", requireAuth, requireAllowedEmail, jobsRoutes);

// ── Serve built frontend (production) ──
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
app.use(express.static(frontendDist));

// ── SPA fallback: serve index.html for non-API routes ──
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// ── Start ──
app.listen(config.port, () => {
  console.log(`Jobs dashboard backend running on port ${config.port}`);
});

export default app;