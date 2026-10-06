# hermes

Development workspace for Ashvin's projects. Each project lives in its own subfolder under this repo.

## Git hooks

On a fresh clone, install the jobs-dashboard development dependencies with `npm ci --include=dev --prefix jobs-dashboard/backend` and `npm ci --include=dev --prefix jobs-dashboard/frontend`, then run `bash ops-scripts/install-git-hooks.sh` once to enable the repository's versioned hooks. The pre-commit hook runs both coverage suites and blocks commits if either backend or frontend line coverage falls below 85%.