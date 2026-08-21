# Echo recovery watchdog (Discord-triggered)

Lightweight **event-driven** recovery: nothing runs until the prod Discord bot’s **uptime monitor** sees **healthy → down**, then it spawns `server/ops/scripts/echo-recovery-watchdog.mjs` once (lock file prevents duplicates).

## Behaviour

| Step | Action                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Confirm **local** API is down (`127.0.0.1:3000/api/v1/health`)                                                                                                 |
| 2    | Scan **dev code** only (no `dist/`, `node_modules/`, exports, uploads, `marketing/terms/`, `public/`, generated `data/`, etc.) and `git log` for the last hour |
| 3a   | **Dev activity found** → do **not** restart until the API stays down for **1 hour** (deploy in progress)                                                       |
| 3b   | **No dev activity** → **restart immediately** (`prod:serve` + PM2 `echo-marketing`)                                                                            |
| 4    | Email summary to **`ECHO_WATCHDOG_NOTIFY_EMAIL`** (default `support@chat-echo.com`)                                                                            |

If the API comes back during the 1h quiet window, the watchdog exits without restarting.

## Enable on VPS

In repo root `.env` (loaded by the prod Discord bot):

```bash
ECHO_RECOVERY_WATCHDOG_ENABLED=1
ECHO_WATCHDOG_NOTIFY_EMAIL=support@chat-echo.com
# optional overrides:
# ECHO_WATCHDOG_DEV_QUIET_MS=3600000
# ECHO_WATCHDOG_LOCAL_HEALTH_URL=http://127.0.0.1:3000/api/v1/health
```

Requires working **`ECHO_SMTP_*`** (same as other Echo mail).

Rebuild/restart the bot after changing env (`npm run build -w bot` then restart `prod:serve` or rolling deploy).

## Manual test

```bash
node server/ops/scripts/echo-recovery-watchdog.mjs --reason=manual-test --dry-run
```

## Logs

- `logs/vps/echo-recovery-watchdog.log` — decisions
- `logs/vps/echo-recovery-watchdog.lock` — single-flight lock

Related: Discord `e!cho uptime` / `ECHO_UPTIME_*` in `bot/src/uptimeMonitor.ts`. For a **persistent** local watcher (45m down → restart, survives VPS reboots), see [echo-recovery-watcher.md](./echo-recovery-watcher.md).
