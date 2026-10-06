import { Router, Request, Response } from "express";
import passport from "passport";
import { requireAuth, requireAllowedEmail } from "../auth/middleware";

const router = Router();

// GET /auth/google — start Google OAuth login
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// GET /auth/google/callback — handle OAuth callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/jobs/?error=auth_failed" }),
  (_req: Request, res: Response) => {
    res.redirect("/jobs/");
  }
);

// GET /auth/user — return current user or 401
router.get("/user", requireAuth, requireAllowedEmail, (req: Request, res: Response) => {
  res.json(req.user);
});

// POST /auth/logout
router.post("/logout", (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

export default router;