# hermes

Development workspace for Ashvin's projects. Each project lives in its own subfolder under this repo.

## Git hooks

After cloning, run `bash ops-scripts/install-git-hooks.sh` once to enable the repository's versioned hooks. The pre-commit hook runs the jobs-dashboard backend coverage suite and blocks commits below 85% line coverage.