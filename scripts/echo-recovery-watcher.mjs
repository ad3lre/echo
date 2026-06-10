#!/usr/bin/env node
/**
 * Persistent prod recovery watcher (systemd / PM2 friendly).
 *
 * - Polls local API health continuously.
 * - Persists outage start time so reboots of this process do not reset the 45m timer.
 * - After 45 minutes down, force-restarts prod:serve + PM2 apps.
 * - On recovery failure, emails bugs@chat-echo.com.
 *
 * Env:
 *   ECHO_RECOVERY_WATCHER_ENABLED=1  (skip start when unset — keeps dev laptops quiet)
 *   ECHO_RECOVERY_WATCHER_DOWN_MS=2700000  (45 min)
 *   ECHO_RECOVERY_WATCHER_POLL_MS=30000
 *   ECHO_RECOVERY_WATCHER_FAILURE_EMAIL=bugs@chat-echo.com
 *   ECHO_WATCHDOG_LOCAL_HEALTH_URL=http://127.0.0.1:3000/api/v1/health
 *   ECHO_SMTP_* (same as other Echo mail)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseMinInteger } from './lib/number-parse.mjs';
import {
  appendRecoveryLog,
  baseEnv,
  loadEnv,
  localApiHealthy,
  resolveLogDir,
  resolveRepoRoot,
  restartProdStack,
  sendRecoveryEmail,
} from './lib/echo-recovery-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot();
const logDir = resolveLogDir(repoRoot);
const metaPath = path.join(logDir, 'echo-recovery-watcher.log');
const statePath = path.join(logDir, 'echo-recovery-watcher-state.json');
const lockPath = path.join(logDir, 'echo-recovery-watcher-recovery.lock');

const DOWN_MS = parseMinInteger(
  process.env.ECHO_RECOVERY_WATCHER_DOWN_MS,
  45 * 60 * 1000,
  60_000,
);
const POLL_MS = parseMinInteger(
  process.env.ECHO_RECOVERY_WATCHER_POLL_MS,
  30_000,
  5_000,
);
const FAILURE_EMAIL =
  process.env.ECHO_RECOVERY_WATCHER_FAILURE_EMAIL?.trim() ||
  'bugs@chat-echo.com';
const LOCAL_HEALTH_URL =
  process.env.ECHO_WATCHDOG_LOCAL_HEALTH_URL?.trim() ||
  'http://127.0.0.1:3000/api/v1/health';

function appendMeta(line) {
  appendRecoveryLog(line, metaPath);
}

function loadState() {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      downSince: typeof data.downSince === 'string' ? data.downSince : null,
      lastRecoveryAttemptAt:
        typeof data.lastRecoveryAttemptAt === 'string'
          ? data.lastRecoveryAttemptAt
          : null,
    };
  } catch {
    return { downSince: null, lastRecoveryAttemptAt: null };
  }
}

function saveState(state) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        downSince: state.downSince,
        lastRecoveryAttemptAt: state.lastRecoveryAttemptAt,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

function acquireRecoveryLock() {
  fs.mkdirSync(logDir, { recursive: true });
  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      const pid = Number(data.pid);
      if (Number.isFinite(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          /* stale */
        }
      }
    } catch {
      /* rewrite */
    }
  }
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    'utf8',
  );
  return true;
}

function releaseRecoveryLock() {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

function downDurationMs(state) {
  if (!state.downSince) return 0;
  const since = Date.parse(state.downSince);
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, Date.now() - since);
}

function recoveryCooldownActive(state) {
  if (!state.lastRecoveryAttemptAt) return false;
  const at = Date.parse(state.lastRecoveryAttemptAt);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < DOWN_MS;
}

async function attemptRecovery(state) {
  if (!acquireRecoveryLock()) {
    appendMeta('recovery skipped: another recovery in progress');
    return state;
  }

  state.lastRecoveryAttemptAt = new Date().toISOString();
  saveState(state);
  appendMeta(
    `recovery: API down ${Math.round(downDurationMs(state) / 60_000)} min — restarting stack`,
  );

  const report = {
    outcome: 'unknown',
    trigger: 'persistent-watcher',
    downMinutes: Math.round(downDurationMs(state) / 60_000),
    restarted: true,
    newPid: null,
    apiOkAfter: null,
    error: '',
  };

  try {
    const { newPid, apiOk } = await restartProdStack({
      repoRoot,
      appendMeta,
      env: baseEnv(repoRoot),
      localHealthUrl: LOCAL_HEALTH_URL,
    });
    report.newPid = newPid;
    report.apiOkAfter = apiOk;
    report.outcome = apiOk ? 'restarted_ok' : 'restarted_api_still_down';
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.outcome = 'restart_failed';
    appendMeta(`recovery failed: ${report.error}`);
  } finally {
    releaseRecoveryLock();
  }

  if (report.outcome === 'restarted_ok') {
    state.downSince = null;
    saveState(state);
    appendMeta('recovery succeeded — API healthy');
    return state;
  }

  appendMeta(
    `recovery failed outcome=${report.outcome} — emailing ${FAILURE_EMAIL}`,
  );
  await sendRecoveryEmail(
    {
      outcome: report.outcome,
      trigger: report.trigger,
      downMinutes: report.downMinutes,
      newProdServePid: report.newPid ?? 'none',
      apiHealthyAfterRestart: report.apiOkAfter ? 'yes' : 'no',
      error: report.error || 'none',
    },
    {
      notifyEmail: FAILURE_EMAIL,
      appendMeta,
      subject: `[Echo VPS] Recovery FAILED — ${report.outcome}`,
      text: [
        'Echo production recovery watcher could not restore the API.',
        '',
        `Outcome: ${report.outcome}`,
        `API was down for: ~${report.downMinutes} minutes before restart`,
        `Trigger: ${report.trigger}`,
        `Host: ${os.hostname()}`,
        `Time (UTC): ${new Date().toISOString()}`,
        '',
        `prod:serve pid after restart: ${report.newPid ?? 'none'}`,
        `API healthy after restart: ${report.apiOkAfter ? 'yes' : 'no'}`,
        report.error ? `Error: ${report.error}` : '',
        '',
        'Manual intervention may be required.',
        '',
        '— Echo recovery watcher',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  );

  return state;
}

async function tick(state) {
  const healthy = await localApiHealthy(LOCAL_HEALTH_URL);

  if (healthy) {
    if (state.downSince) {
      appendMeta(
        `API recovered after ${Math.round(downDurationMs(state) / 60_000)} min down`,
      );
      state.downSince = null;
      saveState(state);
    }
    return state;
  }

  if (!state.downSince) {
    state.downSince = new Date().toISOString();
    saveState(state);
    appendMeta('API down — outage timer started');
    return state;
  }

  const downFor = downDurationMs(state);
  if (downFor < DOWN_MS) {
    return state;
  }

  if (recoveryCooldownActive(state)) {
    return state;
  }

  return attemptRecovery(state);
}

function parseArgs(argv) {
  for (const a of argv) {
    if (a === '--once') return { once: true };
  }
  return { once: false };
}

async function main() {
  loadEnv(repoRoot);

  if (process.env.ECHO_RECOVERY_WATCHER_ENABLED?.trim() !== '1') {
    console.error(
      '[echo-recovery-watcher] disabled (set ECHO_RECOVERY_WATCHER_ENABLED=1)',
    );
    process.exit(0);
  }

  const { once } = parseArgs(process.argv.slice(2));
  let state = loadState();

  appendMeta(
    `started pid=${process.pid} downThresholdMin=${Math.round(DOWN_MS / 60_000)} pollMs=${POLL_MS} once=${once}`,
  );
  if (state.downSince) {
    appendMeta(
      `resumed outage from ${state.downSince} (${Math.round(downDurationMs(state) / 60_000)} min elapsed)`,
    );
  }

  const shutdown = (signal) => {
    appendMeta(`stopping (${signal})`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  do {
    try {
      state = await tick(state);
    } catch (e) {
      appendMeta(`tick error: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (true);
}

main().catch((e) => {
  appendMeta(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
