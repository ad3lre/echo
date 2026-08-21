#!/usr/bin/env bash
set -euo pipefail
# Install echo-recovery-watcher systemd unit (see server/ops/infra/systemd/README.md).
# Usage: sudo ./server/ops/scripts/deploy/install-recovery-watcher.sh

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
UNIT_DIR="$REPO_ROOT/server/ops/infra/systemd"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo."
  exit 1
fi

mkdir -p /etc/echo
if [[ ! -f /etc/echo/recovery-watcher.env ]]; then
  echo "Creating /etc/echo/recovery-watcher.env from example — edit PATH and SMTP."
  cp -v "${UNIT_DIR}/echo-recovery-watcher.env.example" /etc/echo/recovery-watcher.env
  chmod 640 /etc/echo/recovery-watcher.env
  chown root:echo /etc/echo/recovery-watcher.env
fi

cp -v "${UNIT_DIR}/echo-recovery-watcher.service" /etc/systemd/system/
systemctl daemon-reload
echo "Installed. Enable and start:"
echo "  systemctl enable --now echo-recovery-watcher.service"
echo "Follow logs:"
echo "  journalctl -u echo-recovery-watcher -f"
echo "  tail -f ${REPO_ROOT}/logs/vps/echo-recovery-watcher.log"
