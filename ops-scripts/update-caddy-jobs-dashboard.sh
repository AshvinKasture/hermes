#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Script: update-caddy-jobs-dashboard.sh
# Task:  Add /jobs path-based routing to Caddy for the Job
#         Openings Dashboard (port 9120)
# ============================================================

echo "═══════════════════════════════════════════════════"
echo "  Caddy Config Update — Job Openings Dashboard"
echo "═══════════════════════════════════════════════════"
echo ""
echo "This will:"
echo "  1. Write a new Caddyfile to /etc/caddy/Caddyfile"
echo "  2. Add handle_path /jobs/* → localhost:9120"
echo "  3. Keep existing hermes.ashtech.dev → localhost:9119"
echo "  4. Reload Caddy to apply the change"
echo ""
echo "Caddyfile will look like:"
echo "  hermes.ashtech.dev {"
echo "      handle_path /jobs/* {"
echo "          reverse_proxy localhost:9120"
echo "      }"
echo "      reverse_proxy localhost:9119"
echo "  }"
echo ""

read -rp "Proceed? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "📝 Writing /etc/caddy/Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDYEOF'
hermes.ashtech.dev {
	# Job Openings Dashboard (strips /jobs prefix before proxying)
	handle_path /jobs/* {
		reverse_proxy localhost:9120
	}

	# Hermes dashboard
	reverse_proxy localhost:9119
}
CADDYEOF

echo "🔄 Reloading Caddy..."
sudo systemctl reload caddy || sudo caddy reload --config /etc/caddy/Caddyfile

echo ""
echo "✅ Done. Visit https://hermes.ashtech.dev/jobs to test."