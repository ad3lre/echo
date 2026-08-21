#!/bin/bash
# One-command backup setup for Echo Option B
# Usage: sudo bash server/ops/scripts/backup/install-backup.sh

set -e

echo "=== Echo Postgres Backup Setup ==="

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "Please run with sudo"
  exit 1
fi

# Create directories
mkdir -p /etc/echo
mkdir -p /var/lib/echo/backups/tmp

# Copy systemd files if not present
if [ ! -f /etc/systemd/system/echo-backup.service ]; then
  cp server/ops/infra/systemd/echo-backup.service /etc/systemd/system/
  cp server/ops/infra/systemd/echo-backup.timer /etc/systemd/system/
  echo "Installed systemd units"
else
  echo "Systemd units already installed"
fi

# Create env template if not present
if [ ! -f /etc/echo/backup-upload.env ]; then
  cat > /etc/echo/backup-upload.env << 'EOF'
# EDIT THESE VALUES - write-only credentials
DATABASE_URL=postgresql://echo:YOUR_PASSWORD@localhost:5432/echo
ECHO_BACKUP_S3_BUCKET=echo-backups
ECHO_BACKUP_S3_ENDPOINT=https://YOUR_ACCOUNT.r2.cloudflarestorage.com
ECHO_BACKUP_S3_ACCESS_KEY=YOUR_WRITE_ONLY_KEY
ECHO_BACKUP_S3_SECRET_KEY=YOUR_WRITE_ONLY_SECRET
ECHO_BACKUP_S3_PREFIX=postgres
ECHO_BACKUP_TMP_DIR=/var/lib/echo/backups/tmp
EOF
  chmod 640 /etc/echo/backup-upload.env
  chown root:echo /etc/echo/backup-upload.env 2>/dev/null || chown root:root /etc/echo/backup-upload.env
  echo "Created /etc/echo/backup-upload.env (edit with your credentials)"
else
  echo "backup-upload.env already exists"
fi

# Create restore env placeholder
if [ ! -f /etc/echo/backup-restore.env ]; then
  touch /etc/echo/backup-restore.env
  chmod 600 /etc/echo/backup-restore.env
  echo "Created /etc/echo/backup-restore.env (root-only, for restore)"
fi

# Reload systemd
systemctl daemon-reload

echo ""
echo "=== Setup complete. Next steps ==="
echo "1. Edit /etc/echo/backup-upload.env with your S3 credentials"
echo "2. Test: sudo -u echo systemctl start echo-backup.service"
echo "3. Enable: sudo systemctl enable --now echo-backup.timer"
echo ""
echo "For restore credentials (separate read token):"
echo "sudo nano /etc/echo/backup-restore.env"
