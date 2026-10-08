import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import type { Config } from "../config";
import { isAllowedIdentity } from "./allowlist";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

export function profileToIdentity(profile: Profile) {
  const raw = (profile._json ?? {}) as { email_verified?: boolean | string };
  return {
    email: profile.emails?.[0]?.value ?? "",
    emailVerified: raw.email_verified === true || raw.email_verified === "true",
  };
}

type Done = (error: unknown, user?: AppUser | false) => void;

/** Build the OAuth verify callback: only the allowed, verified identity gets a session. */
export function makeVerify(config: Config) {
  return (_accessToken: string, _refreshToken: string, profile: Profile, done: Done): void => {
    const identity = profileToIdentity(profile);
    if (!isAllowedIdentity(identity, config.allowedEmail)) {
      console.warn(`[auth] denied login for ${identity.email || "unknown"}`);
      return done(null, false);
    }
    done(null, {
      id: profile.id,
      name: profile.displayName || identity.email.split("@")[0],
      email: identity.email,
      picture: profile.photos?.[0]?.value ?? "",
    });
  };
}

export function setupPassport(config: Config): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientID,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackURL,
      },
      makeVerify(config)
    )
  );
  passport.serializeUser((user: Express.User, done) => done(null, user));
  passport.deserializeUser((user: Express.User, done) => done(null, user));
}
