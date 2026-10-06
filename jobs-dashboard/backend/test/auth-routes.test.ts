import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import express, { Request, Response, NextFunction } from "express";
import passport from "passport";

process.env.ALLOWED_EMAIL = "allowed@example.com";

let authRoutes: express.Router;
let server: ReturnType<typeof createServer>;
let baseUrl: string;
const originalAuthenticate = passport.authenticate.bind(passport);

before(async () => {
  passport.authenticate = ((strategy: string, options?: Record<string, unknown>) => {
    if (strategy === "google" && options?.failureRedirect) {
      return (_req: Request, res: Response) => res.redirect(String(options.failureRedirect));
    }
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }) as typeof passport.authenticate;

  ({ default: authRoutes } = await import("../src/routes/auth"));
  passport.authenticate = originalAuthenticate;

  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const email = req.header("x-test-email");
    (req as Request & { isAuthenticated: () => boolean }).isAuthenticated = () => Boolean(email);
    if (email) req.user = { id: "test-user", name: "Test User", email, picture: "" };
    next();
  });
  app.use("/auth", authRoutes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  passport.authenticate = originalAuthenticate;
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

test("OAuth failure redirects back into the jobs app", async () => {
  const response = await fetch(`${baseUrl}/auth/google/callback`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/jobs/?error=auth_failed");
});

test("unauthenticated users are denied by /auth/user", async () => {
  const response = await fetch(`${baseUrl}/auth/user`);
  assert.equal(response.status, 401);
});

test("authenticated users outside the allowlist are denied by /auth/user", async () => {
  const response = await fetch(`${baseUrl}/auth/user`, { headers: { "x-test-email": "other@example.com" } });
  assert.equal(response.status, 403);
});

test("the allowed account can still read /auth/user", async () => {
  const response = await fetch(`${baseUrl}/auth/user`, { headers: { "x-test-email": "allowed@example.com" } });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { email: string }).email, "allowed@example.com");
});
