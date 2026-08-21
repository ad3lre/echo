# systemd: production redeploy (`npm run vps:prod`)

Production deploy is a **single checkout** at `/home/founder/prod/echo` (or your path). Run manually:

```bash
cd /home/founder/prod/echo
npm run vps:prod
```

That preverifies TypeScript, runs `npm run build`, stops the previous stack, and starts `npm run prod` (API **:3000**, SPA **:4173**, Discord bot). Logs: `logs/vps/prod.*.log`. See [linux-vps-deployment.md](../../../../docs/operations/linux-vps-deployment.md).

## Automate `vps:prod`

1. Copy `echo-vps-prod.env.example` to `/etc/echo/vps-prod.env` and fix `PATH` to the Node that should run under systemd.
2. Edit `WorkingDirectory` in `echo-vps-prod.service` if your checkout is not `/home/founder/prod/echo`.
3. `sudo ./server/ops/scripts/deploy/install-vps-prod-systemd.sh`
4. Test: `sudo systemctl start echo-vps-prod.service` and `journalctl -u echo-vps-prod -e`
5. Optional timer: `sudo systemctl enable --now echo-vps-prod.timer`

---

# systemd: daily Postgres backups (Option B)

Automated offsite Postgres dumps using write-only credentials. See [docs/operations/runbooks/backup-restore.md](../../../../docs/operations/runbooks/backup-restore.md) for full documentation.

## Architecture

- **Easy put**: `echo-backup.service` runs daily with write-only S3 credentials
- **Hard take**: Restore requires `sudo` and separate read credentials
- **Retention**: 7 days daily + 12+ weeks weekly via bucket lifecycle (not app deletes)

## One-time setup

### 1. Create backup bucket and credentials

Create a dedicated backup bucket (separate from `ECHO_S3_*` media bucket). Example Cloudflare R2:

- **Daily lifecycle**: `postgres/daily/*` → expire after 7 days
- **Weekly lifecycle**: `postgres/weekly/*` → expire after 90 days

Create **two** API tokens:

1. **Upload token** (Object Write only, no Read/List/Delete)
2. **Restore token** (Object Read, stored separately for root-only access)

### 2. Configure upload credentials

```bash
sudo mkdir -p /etc/echo
sudo cp server/ops/infra/systemd/echo-backup.env.example /etc/echo/backup-upload.env
sudo chmod 640 /etc/echo/backup-upload.env
sudo chown root:echo /etc/echo/backup-upload.env
```

Edit `/etc/echo/backup-upload.env` with:

- `DATABASE_URL` (same as app)
- `ECHO_BACKUP_S3_*` (write-only credentials to backup bucket)
- `PATH` (to Node/npm if using nvm)

### 3. Configure restore credentials (root-only)

```bash
sudo touch /etc/echo/backup-restore.env
sudo chmod 600 /etc/echo/backup-restore.env
```

Edit with **read-capable** credentials:

```
ECHO_BACKUP_S3_ACCESS_KEY=your_read_key
ECHO_BACKUP_S3_SECRET_KEY=your_read_secret
ECHO_BACKUP_S3_BUCKET=echo-backups
ECHO_BACKUP_S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
DATABASE_URL=postgresql://echo:pass@localhost/echo
```

### 4. Install systemd units

```bash
sudo cp server/ops/infra/systemd/echo-backup.service server/ops/infra/systemd/echo-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

### 5. Test backup

```bash
sudo -u echo systemctl start echo-backup.service
journalctl -u echo-backup -e
```

Check your bucket dashboard for `postgres/daily/YYYY-MM-DD.dump`.

### 6. Enable timer

```bash
sudo systemctl enable --now echo-backup.timer
systemctl list-timers echo-backup.timer
```

## Restore procedure (requires sudo)

See [backup-restore.md](../../../../docs/operations/runbooks/backup-restore.md) for full procedure:

```bash
# Download and restore to scratch database for verification
sudo -E npm run backup:postgres:restore -- \
  --date 2026-06-05 \
  --tier daily \
  --target-database-url postgres://restoreuser:pass@localhost/echo_scratch
```

Restore credentials are **not** loaded by the backup service; they live only in `/etc/echo/backup-restore.env` (root:root 600).

---

# systemd: persistent recovery watcher

Always-on monitor: if the **local** API stays down for **45 minutes**, force-restart `prod:serve` + PM2 apps. Survives host reboots via `Restart=always`. On failed recovery, emails **`bugs@chat-echo.com`**.

Full behaviour: [docs/operations/echo-recovery-watcher.md](../../../../docs/operations/echo-recovery-watcher.md).

## One-time setup

```bash
sudo ./server/ops/scripts/deploy/install-recovery-watcher.sh
sudo nano /etc/echo/recovery-watcher.env   # PATH, ECHO_SMTP_*, ECHO_REPO_ROOT
sudo systemctl enable --now echo-recovery-watcher.service
```

Check:

```bash
systemctl status echo-recovery-watcher
journalctl -u echo-recovery-watcher -e
tail -f /opt/echo/logs/vps/echo-recovery-watcher.log
```
