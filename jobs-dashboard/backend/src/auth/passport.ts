import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { config } from "../config";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export function setupPassport(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientID,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackURL,
      },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (error: unknown, user?: unknown) => void
      ) => {
        const email = profile.emails?.[0]?.value || "";
        const user: AppUser = {
          id: profile.id,
          name: profile.displayName || email.split("@")[0],
          email,
          picture: profile.photos?.[0]?.value || "",
        };
        return done(null, user);
      }
    )
  );

  passport.serializeUser((user: unknown, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: unknown, done) => {
    done(null, user as AppUser);
  });
}