# Cockpit: VM management app (MVP plan) — DRAFT

Status: planning only. No implementation until plan is locked.

## Scope (MVP)
1. Live dashboard: current RAM, vCPU %, uptime
2. Historical graph: RAM + vCPU over time (presets: 10m, 30m, 1h, 6h, 12h, 24h [default], 3d, 7d, custom range)
3. Web terminal (cloud shell) on the VM
4. File explorer (modern UI) + built-in editor (open, view, edit)

## Architecture
Browser -> HTTPS -> Caddy (hermes.ashtech.dev)
  - /            -> Hermes dashboard :9119
  - /jobs*       -> jobs dashboard
  - /cockpit*    -> Cockpit :9200 (loopback only)

Single backend process serving API + built React SPA, run via systemd.

## Decisions (edit the "Decision" lines)

| # | Topic | Options | Recommendation | Decision |
|---|-------|---------|----------------|----------|
| 1 | Hosting | /cockpit path vs cockpit.ashtech.dev subdomain | Path (as requested); subdomain gives cookie isolation | TBD |
| 2 | Backend | .NET 8 vs Node/TS | .NET 8 (stack match) | TBD |
| 3 | Identity | Google OAuth, allowlisted email(s); new vs reused OAuth client | New client, one email | TBD (email: ?) |
| 4 | File scope | A: home only / B: whole FS, read-only outside home / C: whole FS as user | B | TBD |
| 5 | Terminal security | a: auth only / b: + re-auth within 15 min / c: + TOTP | b | TBD |
| 6 | Metrics | interval 15s, retention 30d, CPU+RAM only | as listed | TBD |
| 7 | Editor/explorer | Monaco, max edit 5 MB, delete -> trash | as listed | TBD |
| 8 | Process mgmt | systemd as user ashvin vs Docker | systemd, port 9200 | TBD |

## Features detail

### A. Live dashboard
- CPU % total (+ optional per-core), RAM used/total/%, uptime
- Source: /proc/stat, /proc/meminfo, /proc/uptime
- Refresh every 2-5s

### B. Historical graphs
- Background sampler every 15s -> SQLite metrics(ts, cpu_pct, mem_used, mem_total)
- Retention 30d, nightly prune
- GET /api/metrics?from=&to= ; server downsamples to ~300-500 points
- Chart with tooltips, zoom, dual CPU/RAM
- History starts only once service runs

### C. Terminal
- xterm.js + server PTY over WebSocket, resize support
- Runs as ashvin; idle timeout; audit log; Origin check
- Optional re-auth gate

### D. File explorer + editor
- Tree + main pane, list/grid, breadcrumbs, search, sort, icons
- Context menu: rename, delete, new file/folder, copy path, download
- Drag-drop upload, keyboard nav
- Monaco editor: tabs, dirty indicator, Ctrl+S
- Safety: size/binary limits, atomic save, conflict detection, trash, path-escape + symlink checks

## Security
- Google OIDC, server-side email allowlist (email_verified=true), else 403
- HttpOnly/Secure/SameSite cookie; all API + WS require auth
- Secrets: user adds client ID/secret to env file himself (assistant never touches values)

## Layout
cockpit/
  src/Cockpit.Api/   (auth, metrics, files, terminal)
  src/cockpit-web/   (React + Vite + TS + Tailwind/shadcn)
  deploy/            (cockpit.service, Caddy snippet)
  data/cockpit.db

## Build order
1. Skeleton + auth + Caddy routing
2. Metrics collector, dashboard, graphs
3. File explorer, then editor
4. Terminal
5. Hardening, systemd, deploy

## VM checks to do (read-only)
- [ ] How jobs dashboard does auth/hosting
- [ ] .NET SDK installed? Node?
- [ ] Port 9200 free
- [ ] Current Caddyfile routes

## Open questions / notes
-

---

## Ashvin feedback (append below)

1. It should be hosted on /cockpit itself. So hermes.ashtech.dev/hermes. Also, the deployment would be through docker similar to jobs dashboard
2. I want you to use node.js, and typescript for the backend, similar to the jobs-dashboard
3. For frontend, we would use React, vite, and tailwind. The entire look and feel of the app should be modern looking and user-friendly
4. Auth should be also similar to jobs dashboard. Although I don't know if it restricts the auth to just one person. In any case, this app should restrict it. And the only person who would have access would be ashvin.kasture12345@gmail.com
5. The historical data retention should be configurable in the settings of the cockpit app with defaulting to 90 days
6. Web terminal seems good. If you have any more questions, let me know
7. File explorer is good. It should default to ashvin's home directory, and everything within would have default access (file permissions), but it would almost always be read and write. Outside that, everything should be readonly, but write option should be present. If the user wants to write, he will enter the password (ssh ashvin user's password, similar to sudo).
8. Terminal session should timeout after idle. 
9. If you still have open questions, let me know

---

## Agent response (round 2)

### Findings from jobs-dashboard
- Stack: Express 4 + passport-google-oauth20 + express-session, Node 22 alpine, Docker compose, port 9120, Caddy `handle_path /jobs*` (strips prefix).
- It does restrict to one email via ALLOWED_EMAIL, BUT: (a) the check is `config.allowedEmail && ...`, so an empty value means everyone is allowed (fails open); (b) it does not check email_verified. Cockpit must fail closed: refuse to start if ALLOWED_EMAIL is empty, and check email_verified.
- Jobs-dashboard port is published as 0.0.0.0:9120 (reachable from the internet if the firewall allows). Cockpit should bind 127.0.0.1:9200 only.

### Locked (from feedback)
1 path /cockpit, Docker. 2 Node + TS. 3 React + Vite + Tailwind. 4 single email ashvin.kasture12345@gmail.com. 5 retention configurable in Settings, default 90d. 6 terminal OK, idle timeout. 7 home = read/write; outside = read-only with password-gated write unlock. 8 idle timeout.

### Open questions
A. URL typo? "hermes.ashtech.dev/hermes" -> assuming hermes.ashtech.dev/cockpit.
B. Docker vs host access (biggest design issue). A container sees its own filesystem/processes, not the VM's. Options:
   - B1 (recommended): container + read-only mount of host /proc (metrics), bind-mount host / at /host (files), terminal = SSH from the container to host localhost as ashvin. Keeps the container unprivileged. Needs sshd on host and an SSH key or password for the terminal.
   - B2: privileged container with pid=host and nsenter into host. Simpler, but a container escape is trivial: effectively root on host.
   - B3: run Cockpit directly on host via systemd (no Docker). Simplest and safest for host access, but breaks your "like jobs-dashboard" Docker preference.
C. Write unlock password: verify against what? Recommend `sudo -S -v`-style check or PAM via the SSH login. The password is typed in the browser each time, sent over HTTPS, never stored; unlock lasts N minutes (suggest 10) then re-locks. Add rate limiting (e.g. 5 tries then lockout). OK?
D. Re-auth before terminal (Google re-login in last 15 min): keep, or drop since the terminal will need the SSH password anyway?
E. Idle timeout length: suggest 15 min for terminal, 12 h absolute session cookie.
F. Retention setting: store in SQLite settings table; pruning applies after change. Anything else in Settings for MVP (sample interval)?
G. Chart library: Recharts (simple) vs uPlot (faster for long ranges). Suggest Recharts with server-side downsampling.
H. Editor: Monaco OK (~5 MB lazy-loaded)?
I. Port 9200 and a new Google OAuth client (redirect https://hermes.ashtech.dev/cockpit/auth/google/callback): OK? You create the client and set GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET in cockpit/.env yourself.

---

## Round 3 decisions (from Ashvin)
- Docker confirmed; use B1 (unprivileged container, host /proc ro, host / bind-mounted at /host, terminal via SSH to host as ashvin).
- Write-unlock lasts 10 min. Terminal auth = SSH password only (no Google re-auth). Terminal idle timeout 15 min.
- Recharts + Monaco confirmed.
- OAuth: reuse jobs-dashboard Google client. Secret copied by shell without displaying it (at setup time, with approval). SESSION_SECRET will be newly generated, NOT shared with jobs-dashboard.
- TODO (Ashvin): add redirect URI https://hermes.ashtech.dev/cockpit/auth/google/callback to the existing OAuth client in Google Cloud Console.

---

# FINAL PLAN (v1) — awaiting Ashvin's approval to implement

URL: https://hermes.ashtech.dev/cockpit. Only MVP setting: history retention (default 90 days).

## 1. Architecture
Browser -> Caddy (host, TLS) -> `handle_path /cockpit/*` -> 127.0.0.1:9200 (Docker container `cockpit`)
- Caddy strips the prefix (same as jobs). Vite `base: '/cockpit/'`, React Router basename `/cockpit`, session cookie `Path=/cockpit`, PUBLIC_URL=https://hermes.ashtech.dev/cockpit. Add `redir /cockpit /cockpit/`.
- Compose publishes `127.0.0.1:9200:9200` only (not 0.0.0.0).
- Container runs as ashvin's UID/GID (APP_UID/APP_GID, verified at build with `id ashvin`) so file permissions inside home behave exactly like the shell.

## 2. Host access from Docker (B1)
| Need | Mechanism |
|---|---|
| Metrics | host /proc mounted ro at /host/proc (CPU, RAM, uptime) |
| Files | host `/` bind-mounted **ro** at /host; `/home/ashvin` mounted **rw** on top at /host/home/ashvin. Read-only outside home is enforced by the kernel, not just app code |
| Writes outside home | after password unlock, done on the host via SSH + `sudo` (never through the mount) |
| Terminal | ssh2 client in the container -> host sshd (host.docker.internal / docker gateway) as ashvin, real remote PTY, bridged to xterm.js over WebSocket |
- Host key of sshd is pinned on first use. Needs firewall to allow docker bridge -> host :22 (verify at build).
- Container: non-root, `no-new-privileges`, cap_drop ALL, no privileged flag, no docker socket.

## 3. Auth
- passport-google-oauth20 + express-session, same OAuth client as jobs-dashboard (redirect URI https://hermes.ashtech.dev/cockpit/auth/google/callback must be added by Ashvin in Google Cloud Console).
- Fail closed: server refuses to start if ALLOWED_EMAIL is empty; require email_verified=true and exact (case-insensitive) match to ashvin.kasture12345@gmail.com. Else 403.
- Session store persisted (SQLite) so restarts don't log you out; cookie HttpOnly, Secure, SameSite=Lax; 12 h absolute lifetime.
- Every /api route and the WebSocket require auth; WebSocket checks Origin; state-changing requests check Origin/Referer (CSRF).
- Rate limit on login and unlock endpoints. Helmet headers.
- Secrets: GOOGLE_CLIENT_ID/SECRET copied from jobs-dashboard/.env into cockpit/.env by a shell command without displaying them (approval at setup time); SESSION_SECRET freshly generated. cockpit/.env is gitignored. Values are never read or printed by me.

## 4. Features
**Dashboard**: CPU % total + per-core, RAM used/total/%, uptime. Polled every 3 s from /api/metrics/current.
**History**: sampler every 15 s -> SQLite `metrics(ts, cpu_pct, mem_used, mem_total)`. Presets 10m, 30m, 1h, 6h, 12h, 24h (default), 3d, 7d + custom range. Server downsamples to <=500 points. Recharts, tooltip, drag zoom. Nightly prune using retention setting; changing it prunes immediately.
**Settings**: retention days (default 90, bounds 1-365).
**Terminal**: xterm.js (fit + web-links), resize, password typed into a login prompt (not stored; used once to open the SSH session), 15 min idle timeout closes the session, audit log (start/end/IP).
**Files**: tree + list/grid, breadcrumbs, search, sort, icons, context menu (rename, delete->trash, new file/folder, copy path, download), drag-drop upload, keyboard nav. Starts at /home/ashvin. Monaco editor (lazy-loaded), tabs, dirty dot, Ctrl+S, atomic save, conflict check via mtime/etag, >5 MB or binary => read-only/download. Path canonicalisation + symlink checks against the mount root.
**Write unlock (outside home)**: banner "Read-only" + "Unlock writes" button -> enter ashvin's SSH password -> verified by SSH login -> held in server memory only, 10 min, then wiped and re-locked (also on logout). 5 failures => 15 min lockout. Outside-home writes run via sudo over SSH; audit-logged.

## 5. API (all under /api, JSON)
- GET /auth/google, /auth/google/callback, POST /auth/logout, GET /api/me
- GET /api/metrics/current; GET /api/metrics?from=&to=&points=
- GET/PUT /api/settings
- GET /api/fs/list?path=; GET /api/fs/read?path=; PUT /api/fs/write; POST /api/fs/mkdir|rename|delete|upload; GET /api/fs/download?path=; GET /api/fs/search?path=&q=
- POST /api/unlock, DELETE /api/unlock, GET /api/unlock/status
- WS /api/terminal (resize + data frames)

## 6. Repo layout (cockpit/)
backend/ (Express + TS, vitest), frontend/ (React + Vite + TS + Tailwind), data/ (gitignored sqlite), Dockerfile (multi-stage node:22-alpine, like jobs), docker-compose.yml, Caddyfile snippet, .env.example, .gitignore, .dockerignore, PLAN.md, README.md. Tests and commit hooks follow the repo's existing .githooks pattern.

## 7. Caddy change (needs approval at deploy)
```
handle_path /cockpit/* { reverse_proxy localhost:9200 }
redir /cockpit /cockpit/
```
Backup /etc/caddy/Caddyfile first, `caddy validate`, then reload.

## 8. Build order
1. Scaffold backend+frontend+Docker, auth (fail-closed) and "logged in" page, compose up on 9200, Caddy route -> verify login end-to-end
2. Metrics sampler, API, dashboard, history chart, settings
3. File API (ro mount + rw home) and explorer UI, then Monaco editor
4. SSH layer: terminal, then write-unlock + sudo writes
5. Hardening, tests, README, commit in small PRs/commits on a branch

## 9. Remaining items for Ashvin
- Add the redirect URI in Google Cloud Console (before first login test).
- Approve: creating cockpit/.env via secret copy; Caddy edit; docker build/up.
- Approve this plan -> I start step 1 immediately.
