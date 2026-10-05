import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { AppUser } from "./passport";

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

/** Require the user to be authenticated. Redirects to login if not. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}

/** Require the user's email to match the allowed email. */
export function requireAllowedEmail(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as AppUser | undefined;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (config.allowedEmail && user.email !== config.allowedEmail) {
    console.warn(`Access denied for ${user.email} (expected ${config.allowedEmail})`);
    res.status(403).json({ error: "Access denied" });
    return;
  }
  next();
}