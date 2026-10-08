# Cockpit

VM control panel served at `https://hermes.ashtech.dev/cockpit`. Google sign-in, restricted to a single allowed email. See [PLAN.md](PLAN.md) for the full design.

## Layout

- `backend/` Express + TypeScript API (auth, sessions; metrics, files and terminal to follow)
- `frontend/` React + Vite + Tailwind SPA (served by the backend in production)
- `Dockerfile`, `docker-compose.yml` container deployment (loopback port 9200)
- `Caddyfile.snippet` route to add to the Caddyfile

## Develop

```bash
cd backend && npm ci --include=dev && npm test
cd ../frontend && npm ci --include=dev && npm test
```

Run `backend` with the variables from `.env.example` exported, and `npm run dev` in `frontend` (proxies `/cockpit/api` and `/cockpit/auth` to :9200).

## Deploy

1. `cp .env.example .env` and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAIL`.
2. Register `https://hermes.ashtech.dev/cockpit/auth/google/callback` as an authorised redirect URI on the OAuth client.
3. `docker compose up -d --build`
4. Add `Caddyfile.snippet` to `/etc/caddy/Caddyfile`, `caddy validate`, then reload.

## Security notes

- Fails closed: the server will not start without `ALLOWED_EMAIL`; only that verified Google email gets a session.
- Container runs non-root, read-only rootfs, no capabilities, published on `127.0.0.1` only.
