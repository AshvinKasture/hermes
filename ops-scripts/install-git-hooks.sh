#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hook_dir="$repo_root/.githooks"

if [[ ! -x "$hook_dir/pre-commit" ]]; then
  echo "Cannot install hooks: $hook_dir/pre-commit is missing or not executable." >&2
  exit 1
fi

git -C "$repo_root" config core.hooksPath "$hook_dir"
echo "Installed repository hooks from $hook_dir"
echo "Backend coverage gate: npm run coverage (minimum 85% lines)"
