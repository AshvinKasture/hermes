#!/usr/bin/env bash
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  Recreate Container — Job Openings Dashboard"
echo "═══════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Stop the running container (stale env vars)"
echo "  2. Remove it"
echo "  3. Start a fresh container with current .env values"
echo "  4. No rebuild needed — image is already up to date"
echo ""

read -rp "Proceed? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

cd /home/ashvin/gh/hermes/jobs-dashboard

echo "🛑 Stopping container..."
sg docker -c "docker compose stop"

echo "🗑️  Removing container..."
sg docker -c "docker compose rm -f"

echo "🚀 Starting fresh container..."
sg docker -c "docker compose up -d"

echo ""
echo "✅ Container restarted with correct env vars."
echo "   Check logs: sg docker -c \"docker compose logs -n 5\""
echo "   Open:       https://hermes.ashtech.dev/jobs"