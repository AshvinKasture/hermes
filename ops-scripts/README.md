# ops-scripts

Operational scripts requiring **sudo** privileges. Whenever Hermes needs you to run something with elevated permissions, the script lands here.

## Convention

1. **Location**: `~/gh/hermes/ops-scripts/` — version-controlled under the repo.
2. **Safety**: Every script prints a **summary of what it will do**, then asks **"Proceed? (y/N)"** before touching anything.
3. **Running**: `bash ~/gh/hermes/ops-scripts/<script-name>.sh` — run it, read the summary, type `y`, enter your sudo password once.
4. **Cleanup**: Scripts that succeed remove themselves or are explicitly marked as applied. (Ask).

## Scripts

| Script | What it does | Status |
|--------|-------------|--------|
| `update-caddy-jobs-dashboard.sh` | Writes new Caddyfile with /jobs path routing, reloads Caddy | 🔴 Not yet run |