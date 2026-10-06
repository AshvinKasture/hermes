import { Router, Request, Response } from "express";
import passport from "passport";

const router = Router();

// GET /auth/google — start Google OAuth login
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// GET /auth/google/callback — handle OAuth callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=auth_failed" }),
  (_req: Request, res: Response) => {
    res.redirect("/jobs/");
  }
);

// GET /auth/user — return current user or 401
router.get("/user", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(req.user);
});

// POST /auth/logout
router.post("/logout", (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

export default router;