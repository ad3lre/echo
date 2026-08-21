#!/usr/bin/env node
/**
 * Event-driven prod recovery (spawned by Discord uptime monitor on healthy→down).
 *
 * 1. Confirm local API is down (127.0.0.1:3000).
 * 2. If dev code changed in the last hour → wait until down for 1h, then restart.
 *    Otherwise → restart immediately (natural death).
 * 3. Email summary to ECHO_WATCHDOG_NOTIFY_EMAIL (default support@chat-echo.com).
 *
 * Env: ECHO_RECOVERY_WATCHDOG_ENABLED=1 on the bot; SMTP via root .env (ECHO_SMTP_*).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot();
const logDir = resolveLogDir(repoRoot);
const lockPath = path.join(logDir, 'echo-recovery-watchdog.lock');
const metaPath = path.join(logDir, 'echo-recovery-watchdog.log');

const DEV_QUIET_MS = parseMinInteger(
  process.env.ECHO_WATCHDOG_DEV_QUIET_MS,
  60 * 60 * 1000,
  1,
);
const DEV_SCAN_MS = parseMinInteger(
  process.env.ECHO_WATCHDOG_DEV_SCAN_MS,
  DEV_QUIET_MS,
  1,
);
const LOCAL_HEALTH_URL =
  process.env.ECHO_WATCHDOG_LOCAL_HEALTH_URL?.trim() ||
  'http://127.0.0.1:3000/api/v1/health';
const NOTIFY_EMAIL =
  process.env.ECHO_WATCHDOG_NOTIFY_EMAIL?.trim() || 'support@chat-echo.com';
const POLL_MS = parseMinInteger(process.env.ECHO_WATCHDOG_POLL_MS, 30_000, 1);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.vue',
  '.astro',
  '.css',
  '.scss',
  '.sql',
]);

/** Directory names pruned during dev-activity scan (generated, deps, user/content). */
const PRUNE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.astro',
  'coverage',
  'exports',
  'logs',
  'uploads',
  'public',
  'terms',
  'cypress',
  'target',
  'gen',
  'data',
  'icons',
  'fonts',
  'twemoji',
  'vendor',
  'cache',
  'trivy-cache',
]);

const DEV_SCAN_ROOTS = [
  'server/backend/src',
  'clients/web/src',
  'bot/src',
  'marketing/src',
  'scripts',
  'shared',
  'docs',
  'infra',
  'server/voice/src',
].map((p) => path.join(repoRoot, p));

const DEV_SCAN_FILES = [
  'package.json',
  'package-lock.json',
  'ecosystem.config.cjs',
  '.nvmrc',
  'server/backend/package.json',
  'clients/web/package.json',
  'bot/package.json',
  'marketing/package.json',
].map((p) => path.join(repoRoot, p));

function appendMeta(line) {
  appendRecoveryLog(line, metaPath);
}

function acquireLock() {
  fs.mkdirSync(logDir, { recursive: true });
  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      const pid = Number(data.pid);
      const started = Date.parse(data.startedAt || '');
      if (
        Number.isFinite(pid) &&
        pid > 0 &&
        Number.isFinite(started) &&
        Date.now() - started < 2 * 60 * 60 * 1000
      ) {
        try {
          process.kill(pid, 0);
          appendMeta(`skip: watchdog already running pid=${pid}`);
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

function releaseLock() {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

async function gitDevActivitySince(sinceMs) {
  const sinceIso = new Date(sinceMs).toISOString();
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'log', '-1', '--since', sinceIso, '--format=%H %s'],
      { maxBuffer: 1024 * 1024 },
    );
    const line = stdout.trim();
    if (!line) return null;
    const [hash, ...rest] = line.split(' ');
    return { kind: 'git-commit', detail: `${hash} ${rest.join(' ')}`.trim() };
  } catch {
    return null;
  }
}

function isCodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return true;
  const base = path.basename(filePath);
  return base === 'package.json' || base === 'Cargo.toml';
}

function scanPathForRecentMtime(absPath, sinceMs, hits, maxHits) {
  if (hits.length >= maxHits) return;
  let st;
  try {
    st = fs.statSync(absPath);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (st.mtimeMs >= sinceMs && isCodeFile(absPath)) {
      hits.push({
        kind: 'file-mtime',
        detail: path.relative(repoRoot, absPath),
        mtime: new Date(st.mtimeMs).toISOString(),
      });
    }
    return;
  }
  if (!st.isDirectory()) return;
  const base = path.basename(absPath);
  if (PRUNE_DIRS.has(base)) return;

  let entries;
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (hits.length >= maxHits) return;
    if (ent.isDirectory() && PRUNE_DIRS.has(ent.name)) continue;
    scanPathForRecentMtime(
      path.join(absPath, ent.name),
      sinceMs,
      hits,
      maxHits,
    );
  }
}

async function filesystemDevActivitySince(sinceMs) {
  const hits = [];
  const maxHits = 8;
  for (const f of DEV_SCAN_FILES) {
    scanPathForRecentMtime(f, sinceMs, hits, maxHits);
    if (hits.length >= maxHits) break;
  }
  for (const root of DEV_SCAN_ROOTS) {
    if (!fs.existsSync(root)) continue;
    scanPathForRecentMtime(root, sinceMs, hits, maxHits);
    if (hits.length >= maxHits) break;
  }
  return hits.length ? hits[0] : null;
}

async function detectDevActivity() {
  const sinceMs = Date.now() - DEV_SCAN_MS;
  const gitHit = await gitDevActivitySince(sinceMs);
  if (gitHit) return { active: true, reason: gitHit };
  const fsHit = await filesystemDevActivitySince(sinceMs);
  if (fsHit) return { active: true, reason: fsHit };
  return { active: false, reason: null };
}

async function sendSummaryEmail(report) {
  const subject = `[Echo VPS] Recovery watchdog — ${report.outcome}`;
  const text = [
    'Echo production recovery watchdog finished.',
    '',
    `Outcome: ${report.outcome}`,
    `Trigger: ${report.trigger}`,
    `Host: ${os.hostname()}`,
    `Time (UTC): ${new Date().toISOString()}`,
    '',
    `Local API before action: ${report.initialDown ? 'down' : 'up'}`,
    `Dev activity (last ${Math.round(DEV_SCAN_MS / 60000)} min): ${report.devActive ? 'yes' : 'no'}`,
    report.devDetail ? `Dev detail: ${report.devDetail}` : '',
    report.waitedMs
      ? `Waited while down: ${Math.round(report.waitedMs / 60000)} min`
      : '',
    report.restarted
      ? `Restart attempted: yes (prod:serve pid ${report.newPid ?? '?'})`
      : 'Restart attempted: no',
    report.apiOkAfter != null
      ? `API healthy after: ${report.apiOkAfter ? 'yes' : 'no'}`
      : '',
    report.error ? `Error: ${report.error}` : '',
    '',
    '— Echo recovery watchdog',
  ]
    .filter(Boolean)
    .join('\n');

  return sendRecoveryEmail(report, {
    notifyEmail: NOTIFY_EMAIL,
    appendMeta,
    subject,
    text,
  });
}

function parseArgs(argv) {
  let trigger = 'manual';
  for (const a of argv) {
    if (a.startsWith('--reason=')) trigger = a.slice('--reason='.length);
    if (a === '--dry-run') return { trigger, dryRun: true };
  }
  return { trigger, dryRun: false };
}

async function main() {
  loadEnv(repoRoot);
  const { trigger, dryRun } = parseArgs(process.argv.slice(2));

  if (!acquireLock()) {
    process.exit(0);
  }

  const report = {
    trigger,
    outcome: 'noop',
    initialDown: false,
    devActive: false,
    devDetail: '',
    waitedMs: 0,
    restarted: false,
    newPid: null,
    apiOkAfter: null,
    error: '',
  };

  try {
    appendMeta(`started trigger=${trigger} dryRun=${dryRun}`);

    const up = await localApiHealthy(LOCAL_HEALTH_URL);
    report.initialDown = !up;
    if (up) {
      report.outcome = 'already_healthy';
      appendMeta('local API already up — exit');
      if (!dryRun) await sendSummaryEmail(report);
      return;
    }

    const dev = await detectDevActivity();
    report.devActive = dev.active;
    if (dev.reason) {
      report.devDetail = `${dev.reason.kind}: ${dev.reason.detail}`;
    }
    appendMeta(
      `dev activity=${dev.active}${report.devDetail ? ` (${report.devDetail})` : ''}`,
    );

    const offlineStart = Date.now();

    if (dev.active) {
      appendMeta(
        `dev quiet window: wait ${Math.round(DEV_QUIET_MS / 60000)} min while down before restart`,
      );
      while (true) {
        if (await localApiHealthy(LOCAL_HEALTH_URL)) {
          report.outcome = 'recovered_during_quiet_window';
          report.waitedMs = Date.now() - offlineStart;
          appendMeta('API recovered during quiet window — no restart');
          if (!dryRun) await sendSummaryEmail(report);
          return;
        }
        const downFor = Date.now() - offlineStart;
        if (downFor >= DEV_QUIET_MS) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      report.waitedMs = Date.now() - offlineStart;
    }

    if (dryRun) {
      report.outcome = dev.active
        ? 'would_restart_after_quiet_window'
        : 'would_restart_immediately';
      appendMeta(`dry-run: ${report.outcome}`);
      await sendSummaryEmail(report);
      return;
    }

    if (await localApiHealthy(LOCAL_HEALTH_URL)) {
      report.outcome = 'recovered_before_restart';
      if (!dryRun) await sendSummaryEmail(report);
      return;
    }

    report.restarted = true;
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
      appendMeta(`restart failed: ${report.error}`);
    }

    await sendSummaryEmail(report);
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  appendMeta(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  releaseLock();
  process.exit(1);
});
