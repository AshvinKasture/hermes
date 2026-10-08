import type { NextFunction, Request, Response } from "express";
import type { Config } from "../config";
import { isAllowedIdentity } from "./allowlist";

/** Require a logged-in session whose email is still the allowed one. */
export function requireAuth(config: Config) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    // Re-check on every request so a changed ALLOWED_EMAIL takes effect immediately.
    if (!isAllowedIdentity({ email: req.user.email, emailVerified: true }, config.allowedEmail)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    next();
  };
}

/** CSRF defence for state-changing requests: Origin must match the public origin. */
export function requireSameOrigin(config: Config) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    if (req.get("origin") !== config.publicOrigin) {
      res.status(403).json({ error: "Cross-origin request blocked" });
      return;
    }
    next();
  };
}
