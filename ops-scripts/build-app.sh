#!/usr/bin/env bash
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  Build & Start — Job Openings Dashboard"
echo "═══════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Build the Docker image (frontend + backend)"
echo "  2. Start the container on port 9120"
echo "  3. Mount job_openings.db read-only"
echo "  4. Apply env vars from jobs-dashboard/.env"
echo ""

read -rp "Proceed? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

cd "$(dirname "$0")/../jobs-dashboard"

echo "🏗️  Building Docker image..."
docker compose build

echo "🚀 Starting container..."
docker compose up -d

echo ""
echo "✅ Container started."
echo "   Check status: docker compose ps"
echo "   View logs:    docker compose logs -f"
echo "   Open:         https://hermes.ashtech.dev/jobs"