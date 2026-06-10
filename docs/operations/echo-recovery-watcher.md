# Echo recovery watcher (persistent)

Always-on **local** health monitor that survives VPS reboots via **systemd** (`Restart=always`). Complements the Discord-triggered [recovery watchdog](./echo-recovery-watchdog.md).

## Behaviour

| Step | Action                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Poll **local** API (`127.0.0.1:3000/api/v1/health`) every 30s (configurable)                                                                                                                                                   |
| 2    | Persist outage start in `logs/vps/echo-recovery-watcher-state.json` so watcher/process reboots do **not** reset the timer                                                                                                      |
| 3    | When API stays down for **45 minutes** → force-restart: stop live `prod:serve`, free ports, start `prod:serve`, restart PM2 apps (`echo-backend`, `echo-frontend`, `echo-video-hls-worker`, `echo-marketing`, `echo-watchdog`) |
| 4    | If API is still down after restart → email **`bugs@chat-echo.com`**                                                                                                                                                            |
| 5    | After a failed recovery, wait another **45 minutes** before retrying (cooldown)                                                                                                                                                |

Successful recoveries are logged only (no email). The Discord watchdog can still fire on public URL transitions for faster reaction in some cases.

## Enable on VPS (systemd)

```bash
sudo ./scripts/deploy/install-recovery-watcher.sh
sudo nano /etc/echo/recovery-watcher.env   # PATH, ECHO_SMTP_*, ECHO_REPO_ROOT
sudo systemctl enable --now echo-recovery-watcher.service
```

Required in `/etc/echo/recovery-watcher.env`:

```bash
ECHO_REPO_ROOT=/opt/echo
ECHO_RECOVERY_WATCHER_ENABLED=1
ECHO_RECOVERY_WATCHER_FAILURE_EMAIL=bugs@chat-echo.com
PATH=/home/echo/.nvm/versions/node/v22.13.0/bin:...
# ECHO_SMTP_* (same as main .env)
```

Edit `WorkingDirectory` and `EnvironmentFile` paths in `infra/systemd/echo-recovery-watcher.service` if your checkout is not `/opt/echo`.

## Manual test

```bash
ECHO_RECOVERY_WATCHER_ENABLED=1 \
ECHO_RECOVERY_WATCHER_DOWN_MS=60000 \
node scripts/echo-recovery-watcher.mjs --once
```

`--once` runs a single poll/recovery cycle then exits (useful for smoke tests).

## Logs

- `journalctl -u echo-recovery-watcher -f` — systemd stdout/stderr
- `logs/vps/echo-recovery-watcher.log` — decisions
- `logs/vps/echo-recovery-watcher-state.json` — persisted outage timer
- `logs/vps/echo-recovery-watcher-recovery.lock` — single-flight recovery lock

## Env reference

| Variable                              | Default                               | Purpose                      |
| ------------------------------------- | ------------------------------------- | ---------------------------- |
| `ECHO_RECOVERY_WATCHER_ENABLED`       | off                                   | Must be `1` to run           |
| `ECHO_RECOVERY_WATCHER_DOWN_MS`       | `2700000` (45 min)                    | Down duration before restart |
| `ECHO_RECOVERY_WATCHER_POLL_MS`       | `30000`                               | Health poll interval         |
| `ECHO_RECOVERY_WATCHER_FAILURE_EMAIL` | `bugs@chat-echo.com`                  | Alert on failed recovery     |
| `ECHO_WATCHDOG_LOCAL_HEALTH_URL`      | `http://127.0.0.1:3000/api/v1/health` | Local probe URL              |

Related: `npm run recovery:watcher` (foreground), Discord `e!cho uptime` / `ECHO_UPTIME_*`.
