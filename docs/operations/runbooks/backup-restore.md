# Runbook: Postgres Backup and Restore (Option B)

Self-hosted Postgres dumps to offsite S3-compatible storage with write-only upload credentials and sudo-gated restore.

---

## Overview

This is **Option B** from the backup strategy: self-hosted `pg_dump` → object storage.

| Feature       | Implementation                                              |
| ------------- | ----------------------------------------------------------- |
| **Easy put**  | Daily automated dumps with **write-only** S3 credentials    |
| **Hard take** | Restore requires **sudo** and separate **read** credentials |
| **Retention** | 7 days daily + 12+ weeks weekly via bucket lifecycle        |
| **Media**     | Postgres only; upload media handled separately              |

---

## Prerequisites

- `pg_dump` and `pg_restore` (install `postgresql-client` on Debian/Ubuntu)
- AWS CLI v2 (`aws s3 cp` command)
- S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2, etc.)
- Separate **backup bucket** (not the public media bucket from `ECHO_S3_*`)

---

## Bucket Setup

### 1. Create backup bucket

Example for Cloudflare R2:

- Bucket name: `echo-backups`
- Location: Same region as your VPS or geographically separated for DR
- **Public access**: Disabled (this is internal backup data)

### 2. Configure lifecycle rules

Retention is enforced by **bucket lifecycle**, not the app:

```json
[
  {
    "ID": "DailyRetention",
    "Filter": {
      "Prefix": "postgres/daily/"
    },
    "Status": "Enabled",
    "Expiration": {
      "Days": 7
    }
  },
  {
    "ID": "WeeklyRetention",
    "Filter": {
      "Prefix": "postgres/weekly/"
    },
    "Status": "Enabled",
    "Expiration": {
      "Days": 90
    }
  }
]
```

This ensures:

- **Daily backups** kept for 7 days
- **Weekly backups** (Sundays) kept for 90+ days
- At least one backup is always **a week away**

### 3. Create credentials

#### Upload token (write-only)

- **Permission**: Object Write only
- **Path**: `postgres/*`
- **No read, list, or delete** permissions
- Use this in `/etc/echo/backup-upload.env`

#### Restore token (read-capable)

- **Permission**: Object Read (and List if your S3 requires it for `aws s3 cp`)
- **Path**: `postgres/*`
- Store this in `/etc/echo/backup-restore.env` (root-only)

---

## Installation

### 1. Copy environment template

```bash
sudo mkdir -p /etc/echo
sudo cp server/ops/infra/systemd/echo-backup.env.example /etc/echo/backup-upload.env
sudo chmod 640 /etc/echo/backup-upload.env
sudo chown root:echo /etc/echo/backup-upload.env
```

### 2. Configure upload credentials

Edit `/etc/echo/backup-upload.env`:

```bash
# Required
DATABASE_URL=postgresql://echo:your_password@localhost:5432/echo
ECHO_BACKUP_S3_BUCKET=echo-backups
ECHO_BACKUP_S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
ECHO_BACKUP_S3_ACCESS_KEY=your_write_only_key
ECHO_BACKUP_S3_SECRET_KEY=your_write_only_secret

# Optional
ECHO_BACKUP_S3_PREFIX=postgres
ECHO_BACKUP_TMP_DIR=/var/lib/echo/backups/tmp

# If using nvm, add Node to PATH
PATH=/home/echo/.nvm/versions/node/v22.13.0/bin:/usr/local/bin:/usr/bin:/bin
```

### 3. Configure restore credentials (root-only)

```bash
sudo touch /etc/echo/backup-restore.env
sudo chmod 600 /etc/echo/backup-restore.env
```

Edit with read-capable credentials:

```bash
ECHO_BACKUP_S3_ACCESS_KEY=your_read_key
ECHO_BACKUP_S3_SECRET_KEY=your_read_secret
ECHO_BACKUP_S3_BUCKET=echo-backups
ECHO_BACKUP_S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
DATABASE_URL=postgresql://echo:your_password@localhost:5432/echo
```

### 4. Install systemd units

```bash
sudo cp server/ops/infra/systemd/echo-backup.service server/ops/infra/systemd/echo-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

### 5. Test backup

```bash
# Run backup manually as echo user
sudo -u echo systemctl start echo-backup.service

# Check logs
journalctl -u echo-backup -e

# Verify in bucket dashboard
# Look for: postgres/daily/YYYY-MM-DD.dump
```

### 6. Enable timer

```bash
sudo systemctl enable --now echo-backup.timer

# Check next run
systemctl list-timers echo-backup.timer
```

---

## Restore Procedure

### Quick restore (requires sudo)

```bash
# Restore from today's daily backup to a scratch database
sudo -E npm run backup:postgres:restore -- \
  --date $(date +%Y-%m-%d) \
  --tier daily \
  --target-database-url postgres://restoreuser:pass@localhost/echo_scratch
```

### Arguments

| Argument                    | Description                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `--date YYYY-MM-DD`         | Date of backup to restore (required)                         |
| `--tier daily\|weekly`      | Use daily or weekly backup (default: daily)                  |
| `--target-database-url URL` | Target database for restore (default: DATABASE_URL from env) |

### Full restore workflow

1. **Identify backup date** from bucket or failure timeline

2. **Create scratch database** for verification:

   ```bash
   sudo -u postgres createdb echo_restore_test
   ```

3. **Restore to scratch**:

   ```bash
   sudo -E npm run backup:postgres:restore -- \
     --date 2026-06-05 \
     --tier daily \
     --target-database-url postgres://echo:pass@localhost/echo_restore_test
   ```

4. **Smoke test** (aligns with [postgres-incident.md](postgres-incident.md)):

   ```bash
   # Point staging API at echo_restore_test
   DATABASE_URL=postgres://echo:pass@localhost/echo_restore_test npm start

   # Verify: login, read channel list, send message
   curl http://localhost:3000/api/v1/health
   ```

5. **Production restore** (destructive):

   ```bash
   # Backup current state first (if possible)
   pg_dump $DATABASE_URL -Fc -f /tmp/pre-restore-$(date +%s).dump

   # Restore over production
   sudo -E npm run backup:postgres:restore -- \
     --date 2026-06-05 \
     --tier daily

   # Restart API to clear connection pool
   sudo systemctl restart echo-api
   ```

---

## Security Model

### Credential separation

| Credential | Location                       | Owner     | Perms | Can                          |
| ---------- | ------------------------------ | --------- | ----- | ---------------------------- |
| Upload     | `/etc/echo/backup-upload.env`  | root:echo | 640   | Write only (PUT new objects) |
| Restore    | `/etc/echo/backup-restore.env` | root:root | 600   | Read (GET objects)           |

### Process isolation

- Backup runs as `echo` user (same as app, but no shell)
- Restore requires **root/sudo** to access read credentials
- App code never sees backup credentials

### Why this matters

If the app server is compromised:

- Attacker can see `backup-upload.env` → **cannot read or delete** existing backups
- Attacker cannot access `backup-restore.env` without escalating to root
- Weekly backups survive for 90 days even if daily are overwritten

---

## Troubleshooting

### Backup fails with "pg_dump not found"

```bash
# Debian/Ubuntu
sudo apt-get install postgresql-client

# RHEL/CentOS
sudo yum install postgresql
```

### Upload fails with "Access Denied"

Check token permissions:

- Must have **Object Write** on `postgres/*`
- Must **NOT** have Read, List, or Delete (write-only is intentional)
- Verify `ECHO_BACKUP_S3_ENDPOINT` matches your provider

### Restore fails with "Permission denied"

- Must run with `sudo`
- `/etc/echo/backup-restore.env` must exist and be root:root 600
- Token must have **Object Read** permission

### Backup file is too large for temp directory

```bash
# Use larger temp directory
sudo mkdir -p /var/lib/echo/backups/tmp
sudo chown echo:echo /var/lib/echo/backups/tmp

# Set in /etc/echo/backup-upload.env
ECHO_BACKUP_TMP_DIR=/var/lib/echo/backups/tmp
```

---

## Monitoring

### Check backup ran

```bash
# View timer status
systemctl status echo-backup.timer

# View recent logs
journalctl -u echo-backup --since "24 hours ago"

# Check for success log entry
journalctl -u echo-backup -g "Backup upload completed successfully"
```

### Alert on failure

Add to your monitoring (Prometheus/node exporter example):

```bash
# Check if backup succeeded in last 26 hours
if ! journalctl -u echo-backup --since "26 hours ago" | grep -q "Backup upload completed successfully"; then
  echo "No successful backup in last 26 hours"
  # Trigger alert
fi
```

### Quarterly restore drill

Documented in [database-migrations.md](database-migrations.md) pattern:

1. Pick random weekly backup (e.g., 3 weeks ago)
2. Restore to scratch database
3. Run smoke tests (login, channel, message)
4. Document RTO (Recovery Time Objective)

---

## Related Documentation

- [server/ops/infra/systemd/README.md](../../../server/ops/infra/systemd/README.md) — systemd setup details
- [postgres-incident.md](postgres-incident.md) — incident response and restore procedures
- [database-migrations.md](database-migrations.md) — migration testing on backup copies
