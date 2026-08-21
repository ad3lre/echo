#!/bin/bash
# Fix backup systemd for this VPS (founder user, repo at /home/founder/prod/echo).
# Usage: sudo bash server/ops/scripts/setup/enable-backup-timer.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
UNIT_DIR="$REPO_ROOT/server/ops/infra/systemd"
ENV_FILE=/etc/echo/backup-upload.env
SERVICE=/etc/systemd/system/echo-backup.service

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo"
  exit 1
fi

mkdir -p /etc/echo /var/lib/echo/backups/tmp
chown founder:founder /var/lib/echo/backups/tmp

cp "$UNIT_DIR/echo-backup.service" "$SERVICE"
cp "$UNIT_DIR/echo-backup.timer" /etc/systemd/system/

sed -i 's/^User=echo/User=founder/' "$SERVICE"
sed -i 's/^Group=echo/Group=founder/' "$SERVICE"
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$REPO_ROOT|" "$SERVICE"

if [ ! -s "$ENV_FILE" ]; then
  cp "$UNIT_DIR/echo-backup.env.example" "$ENV_FILE"
fi

# Sync DATABASE_URL from repo .env when present (write-only S3 keys stay manual).
if [ -f "$REPO_ROOT/.env" ]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$REPO_ROOT/.env" | tail -1 | cut -d= -f2-)"
  if [ -n "$DB_URL" ]; then
    if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
    else
      echo "DATABASE_URL=$DB_URL" >> "$ENV_FILE"
    fi
  fi
fi

chmod 640 "$ENV_FILE"
chown root:founder "$ENV_FILE"

systemctl daemon-reload
systemctl enable --now echo-backup.timer

echo "Backup timer enabled. Edit $ENV_FILE with R2 write-only keys if not set."
echo "Test: sudo -u founder systemctl start echo-backup.service"
