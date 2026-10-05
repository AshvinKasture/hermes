# Job Openings Dashboard — MVP Plan

## Overview

A web dashboard that reads from the existing `job_openings.db` (SQLite) and displays potential job openings with advanced filtering, sorting, and search. Auth-gated behind Google OAuth.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React + TypeScript + Tailwind UI |
| Database | SQLite (`job_openings.db`) — read-only for MVP |
| Auth | Google OAuth 2.0 (via Passport.js) |
| Container | Docker |
| Reverse Proxy | Caddy (existing on this VM) |

---

## 2. Repo Structure

```
~/gh/hermes/                         # GitHub repo root
├── README.md
└── jobs-dashboard/                   # This project's subfolder (your rule)
    ├── PLAN.md                       # ← this file
    ├── docker-compose.yml
    ├── Dockerfile
    ├── .dockerignore
    ├── .env.example
    ├── backend/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts              # Express entry point
    │   │   ├── config.ts             # Env vars, DB path, port
    │   │   ├── auth/
    │   │   │   ├── passport.ts       # Google OAuth strategy setup
    │   │   │   └── middleware.ts     # Session guard, email whitelist
    │   │   ├── db/
    │   │   │   └── jobs.ts           # SQLite queries (read-only)
    │   │   └── routes/
    │   │       ├── auth.ts           # Google OAuth login/callback/logout
    │   │       └── jobs.ts           # GET /api/jobs with filters
    │   └── Dockerfile
    └── frontend/
        ├── package.json
        ├── tsconfig.json
        ├── tailwind.config.js
        ├── public/
        │   └── index.html
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx               # Router setup
        │   ├── components/
        │   │   ├── LoginPage.tsx
        │   │   ├── Dashboard.tsx     # Main dashboard view
        │   │   ├── JobCard.tsx       # Single job listing card
        │   │   ├── FilterBar.tsx     # Advanced filters UI
        │   │   └── SortDropdown.tsx  # Sort controls
        │   ├── hooks/
        │   │   └── useJobs.ts        # Fetch + filter logic
        │   └── types/
        │       └── job.ts
        └── Dockerfile
```

---

## 3. Data Source

- **File**: `/home/ashvin/hermes/job_openings.db`
- **Table**: `job_listings`
- **Columns**: `id`, `company`, `role`, `experience`, `location`, `skills`, `date_posted`, `job_code`, `link`, `source`, `notes`, `created_at`
- **Existing data**: 18 job listings across 6 companies (Accenture, Birlasoft, Capgemini, HCLTech, Icertis, LTIMindtree)
- **Access**: Docker container mounts the DB file read-only at runtime

---

## 4. Auth

- **Provider**: Google OAuth 2.0
- **Strategy**: Passport.js (`passport-google-oauth20`)
- **Callback URI**: `https://hermes.ashtech.dev/jobs/auth/google/callback`
- **Authorization**: Post-login check — only `ashvin.kasture12345@gmail.com` is allowed; everyone else gets a 403
- **Session**: Express-session with memory store (MVP; upgrade to Redis later)

### Google Cloud Console setup needed (by you)

We reuse the **same Google Cloud project** that powers the Hermes dashboard OIDC. You'll need to:

1. Go to **Google Cloud Console → APIs & Services → Credentials**
2. Find the OAuth 2.0 Client (client_id: `480916783035-...`)
3. Add this redirect URI to the **Authorized redirect URIs**:
   ```
   https://hermes.ashtech.dev/jobs/auth/google/callback
   ```
4. Note down the **Client Secret** (or generate one if missing)
5. I'll tell you the env var name to set it in

---

## 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/user` | - | Returns current user info (or 401 if not logged in) |
| GET | `/api/auth/google` | - | Start Google OAuth login |
| GET | `/api/auth/google/callback` | - | OAuth callback |
| POST | `/api/auth/logout` | - | End session |
| GET | `/api/jobs` | Required | List job listings with query params for filtering/sorting |

### `/api/jobs` Query Parameters

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `company` | string | `Accenture` | Filter by company name (partial match) |
| `role` | string | `Engineer` | Filter by role title (partial match) |
| `location` | string | `Pune` | Filter by location (partial match) |
| `experience` | string | `2-5` | Filter by experience range (partial match) |
| `skills` | string | `.NET` | Filter by skills (partial match) |
| `source` | string | `accenture.com` | Filter by source |
| `search` | string | `full stack` | Full-text search across title, company, skills, notes |
| `sort_by` | string | `date_posted` | Field to sort by |
| `sort_order` | string | `desc` | `asc` or `desc` |
| `page` | number | `1` | Pagination (24 per page) |

---

## 6. Frontend Dashboard Features

- **Login page**: "Sign in with Google" button (only shown if unauthenticated)
- **Dashboard layout** (after login):
  - Stats summary bar (total jobs, unique companies, latest posting date)
  - **FilterBar**: Dropdowns for company, location, source, experience range + free-text search box with a "Clear Filters" button
  - **SortDropdown**: Sort by date (newest/oldest), company A-Z, role A-Z
  - **Job cards grid**: 4-column card layout, each card showing:
    - Company name + role title
    - Experience, location, skills (tags/chips)
    - Posted date
    - Source badge
    - External link button ("View on site")
  - **Pagination** at the bottom
- **Responsive**: Works on desktop down to tablet
- **All dark themed** to match the Hermes dashboard visual style

---

## 7. Deployment

| Property | Value |
|----------|-------|
| Internal port | **9120** |
| Public URL | `https://hermes.ashtech.dev/jobs` |
| Runtime | Docker container |
| DB mount | `-v /home/ashvin/hermes/job_openings.db:/data/job_openings.db:ro` |

### Caddy config change

```caddy
hermes.ashtech.dev {
    reverse_proxy /api/* localhost:9120       # API calls
    reverse_proxy /jobs/* localhost:9120      # Frontend + auth callbacks
    reverse_proxy localhost:9119              # Existing Hermes dashboard
}
```

(Will refine this — any static assets the React app serves get their own path rule as needed.)

---

## 8. Env Vars (you supply the secret)

| Var | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | `480916783035-...` (reuse existing) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `SESSION_SECRET` | A random string (generate one) |
| `DB_PATH` | `/data/job_openings.db` |
| `PORT` | `9120` |
| `ALLOWED_EMAIL` | `ashvin.kasture12345@gmail.com` |
| `PUBLIC_URL` | `https://hermes.ashtech.dev/jobs` |

You'll set these in a `.env` file (or pass them to Docker). I'll tell you exactly which file and path.

---

## 9. MVP Acceptance Criteria

- [x] User can view existing job listings from the SQLite database
- [x] User can filter by company, location, role, skills, source
- [x] User can search across title/company/skills
- [x] User can sort by date, company, role
- [x] Only `ashvin.kasture12345@gmail.com` can access the dashboard
- [x] Everything is behind Google OAuth login
- [x] Runs in Docker on port 9120
- [x] Caddy proxies `hermes.ashtech.dev/jobs` to the container

---

## 10. Out of Scope (Future)

- Application status tracking (Applied / Interviewing / Offer / Rejected)
- CRUD operations on job listings (add/edit/delete jobs from the UI)
- Auto-scraping new job listings
- Email notifications for new matching jobs
- Multiple user support
- Recurring job scraping as cron jobs