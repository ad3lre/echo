#!/usr/bin/env bash
set -euo pipefail
# Install echo-vps-prod systemd units (see infra/systemd/README.md).
# Usage: sudo ./scripts/deploy/install-vps-prod-systemd.sh

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="${ROOT}/infra/systemd"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

mkdir -p /etc/echo
if [[ ! -f /etc/echo/vps-prod.env ]]; then
  cp -v "${UNIT_DIR}/echo-vps-prod.env.example" /etc/echo/vps-prod.env
  chmod 640 /etc/echo/vps-prod.env
  chown root:echo /etc/echo/vps-prod.env
  echo "Created /etc/echo/vps-prod.env — edit PATH and WorkingDirectory in the service if needed."
fi

cp -v "${UNIT_DIR}/echo-vps-prod.service" /etc/systemd/system/
cp -v "${UNIT_DIR}/echo-vps-prod.timer" /etc/systemd/system/
systemctl daemon-reload
echo "Installed. Test once:"
echo "  sudo systemctl start echo-vps-prod.service && journalctl -u echo-vps-prod -e"
echo "Optional timer:"
echo "  sudo systemctl enable --now echo-vps-prod.timer"
