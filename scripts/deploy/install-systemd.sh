#!/usr/bin/env bash
set -euo pipefail
# Install echo-deploy-up systemd units (see infra/systemd/README.md).
# Usage: sudo ./scripts/deploy/install-systemd.sh

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="${ROOT}/infra/systemd"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

cp -v "${UNIT_DIR}/echo-deploy-up.service" /etc/systemd/system/
cp -v "${UNIT_DIR}/echo-deploy-up.timer" /etc/systemd/system/
systemctl daemon-reload
echo "Installed. Optional: enable timer with"
echo "  systemctl enable --now echo-deploy-up.timer"
echo "Test once:"
echo "  systemctl start echo-deploy-up.service && journalctl -u echo-deploy-up.service -e"
