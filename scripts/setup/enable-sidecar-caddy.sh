#!/bin/bash
# Append media + games Caddy site blocks and reload.
# Usage: sudo bash scripts/setup/enable-sidecar-caddy.sh
set -euo pipefail

SNIPPET="$(cd "$(dirname "$0")/../.." && pwd)/../echo-deploy-meta/proxy/media-games.caddyfile"
CADDYFILE=/etc/caddy/Caddyfile
MARKER="# echo media-games sidecars"

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo"
  exit 1
fi

if grep -q "$MARKER" "$CADDYFILE" 2>/dev/null; then
  echo "Caddy sidecar blocks already present"
else
  {
    echo ""
    echo "$MARKER"
    cat "$SNIPPET"
  } >> "$CADDYFILE"
  echo "Appended sidecar blocks to $CADDYFILE"
fi

caddy validate --config "$CADDYFILE"
systemctl reload caddy
echo "Caddy reloaded."
