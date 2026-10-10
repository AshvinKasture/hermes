# Cockpit

VM control panel served at `https://hermes.ashtech.dev/cockpit`. Google sign-in, restricted to a single allowed email. See [PLAN.md](PLAN.md) for the full design.

## Layout

- `backend/` Express + TypeScript API (auth, sessions, metrics, files, terminal)
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

## Terminal

The Terminal page opens a real shell on the host as `ashvin`, over SSH from the (unprivileged)
container to the host's own sshd — not a shell inside the container, which couldn't run `sudo`.
The container reaches the host via `host.docker.internal` (mapped to the Docker bridge gateway in
`docker-compose.yml`'s `extra_hosts`; needs sshd listening and reachable from the Docker bridge
subnet, which it already is since no extra firewall rule is required for bridge-to-host traffic).

The SSH password is typed into the terminal's own login prompt in the browser, sent once over the
already-authenticated WebSocket to open the SSH session, and never stored or logged anywhere in
this app. Sessions close automatically after 15 minutes idle (`TERMINAL_IDLE_TIMEOUT_MS`). Start
and end of every session is written to the audit log (`[audit] ... terminal.start` /
`terminal.end`), alongside every other sensitive action.
