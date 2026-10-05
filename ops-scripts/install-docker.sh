#!/usr/bin/env bash
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  Docker Installation"
echo "═══════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Install docker.io from apt"
echo "  2. Add your user to the docker group"
echo "  3. Install docker compose plugin"
echo "  4. Verify installation"
echo ""

read -rp "Proceed? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "📦 Installing docker.io..."
sudo apt-get update -qq
sudo apt-get install -y docker.io

echo "👤 Adding $(whoami) to docker group..."
sudo usermod -aG docker "$(whoami)"

echo "📦 Installing docker compose plugin..."
sudo apt-get install -y docker-compose-v2 2>/dev/null || \
  sudo apt-get install -y docker-compose-plugin 2>/dev/null || \
  echo "⚠️  docker compose plugin not in apt — trying pip..."
  pip3 install docker-compose 2>/dev/null || true

echo ""
echo "✅ Docker installed."
echo "   Version: $(docker --version 2>/dev/null || echo 'needs re-login for group')"
echo ""
echo "⚠️  You need to LOG OUT and back in (or run 'newgrp docker')"
echo "   for the docker group membership to take effect."
echo "   Then come back to me and I'll build the container."