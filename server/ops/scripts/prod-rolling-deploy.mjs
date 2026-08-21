#!/usr/bin/env node
/**
 * Rolling prod deploy for a single checkout:
 * 1. preverify:prod
 * 2. build (live stack on :3000 / :4173 keeps serving)
 * 3. start candidate on staging ports (default :3001 / :4175; :4174 is echo-marketing)
 * 4. health-check candidate
 * 5. stop live + staging, start prod:serve on main ports
 * 6. ensure PM2 companions + Discord bot are up (start if down; skip if already running)
 *
 * Downtime is only the cutover window (~seconds), not the full build.
 * `npm run build` includes `marketing`; PM2 serves `marketing/dist` via astro preview.
 *
 * Env:
 *   ECHO_STAGING_API_PORT      (default 3001)
 *   ECHO_STAGING_FRONTEND_PORT (default 4175)
 *   ECHO_ROLLING_HEALTH_MS     (default 120000)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseIntegerInRange, parseMinInteger } from './lib/number-parse.mjs';
import { ensureCompanionServices } from './lib/ensure-companion-services.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const STAGING_API_PORT = parseIntegerInRange(
  process.env.ECHO_STAGING_API_PORT,
  3001,
  1,
  65_535,
);
const STAGING_FRONTEND_PORT = parseIntegerInRange(
  process.env.ECHO_STAGING_FRONTEND_PORT,
  4175,
  1,
  65_535,
);
const HEALTH_TIMEOUT_MS = parseMinInteger(
  process.env.ECHO_ROLLING_HEALTH_MS,
  120_000,
  1,
);
const logDir = path.join(repoRoot, 'logs', 'vps');
const metaPath = path.join(logDir, 'prod.rolling.log');
const stagingPidFile = path.join(logDir, 'echo-vps-prod.staging.pid');
const livePidFile = path.join(logDir, 'echo-vps-prod.pid');

function appendMeta(line) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    metaPath,
    `[${new Date().toISOString()}] ${line}\n`,
    'utf8',
  );
}

function nvmNodeBinDir() {
  try {
    const rcPath = path.join(repoRoot, '.nvmrc');
    if (!fs.existsSync(rcPath)) return '';
    const raw = fs.readFileSync(rcPath, 'utf8').trim().split(/\s+/)[0];
    if (!raw) return '';
    const base = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (!fs.existsSync(base)) return '';
    const want = raw.replace(/^v/, '');
    const dirs = fs.readdirSync(base).filter((d) => {
      if (!d.startsWith('v')) return false;
      const rest = d.slice(1);
      return (
        rest === want ||
        rest.startsWith(`${want}.`) ||
        (want.includes('.') && rest.startsWith(want))
      );
    });
    if (!dirs.length) return '';
    dirs.sort();
    const bin = path.join(base, dirs[dirs.length - 1], 'bin');
    return fs.existsSync(path.join(bin, 'node')) ? bin : '';
  } catch {
    return '';
  }
}

function baseEnv() {
  const env = { ...process.env, FORCE_COLOR: '0' };
  const nvmBin = nvmNodeBinDir();
  if (nvmBin) env.PATH = `${nvmBin}${path.delimiter}${env.PATH}`;
  return env;
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: opts.stdio ?? 'inherit',
      env: opts.env ?? baseEnv(),
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve(undefined);
      else
        reject(
          new Error(
            `${cmd} ${args.join(' ')} exited code=${code ?? 'null'} signal=${signal ?? 'none'}`,
          ),
        );
    });
  });
}

async function loadTreeKill() {
  try {
    const mod = await import('tree-kill');
    return mod.default;
  } catch {
    return null;
  }
}

async function killTree(pid, treeKill) {
  if (!pid) return;
  if (treeKill) {
    await new Promise((resolve) => {
      treeKill(pid, 'SIGTERM', () => resolve());
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* ESRCH */
  }
}

function readPidFile(pidFile) {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function waitForHttp(url, timeoutMs = HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
      clearTimeout(to);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`health check timed out: ${url}`);
}

function spawnDetached(cmd, args, pidFile) {
  const outPath = path.join(logDir, 'prod.rolling.stdout.log');
  const errPath = path.join(logDir, 'prod.rolling.stderr.log');
  fs.mkdirSync(logDir, { recursive: true });
  const outFd = fs.openSync(outPath, 'a');
  const errFd = fs.openSync(errPath, 'a');
  const child = spawn(cmd, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: baseEnv(),
    shell: false,
  });
  try {
    child.unref();
  } catch {
    /* ignore */
  }
  fs.writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  try {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  } catch {
    /* ignore */
  }
  return child.pid;
}

function spawnDetachedNpm(args, pidFile) {
  return spawnDetached(npmCmd(), args, pidFile);
}

async function main() {
  appendMeta('rolling deploy started');
  const treeKill = await loadTreeKill();

  appendMeta('preverify:prod');
  await run(npmCmd(), ['run', 'preverify:prod']);

  appendMeta('build (live stack unchanged)');
  await run(npmCmd(), ['run', 'build']);

  appendMeta(
    `staging serve on api=${STAGING_API_PORT} frontend=${STAGING_FRONTEND_PORT}`,
  );
  spawnDetached(
    process.execPath,
    [
      path.join(repoRoot, 'server/ops/scripts/prod-staging-serve.mjs'),
      `--api-port=${STAGING_API_PORT}`,
      `--frontend-port=${STAGING_FRONTEND_PORT}`,
    ],
    stagingPidFile,
  );

  appendMeta('waiting for staging health');
  await waitForHttp(
    `http://127.0.0.1:${STAGING_API_PORT}/api/v1/health?ts=${Date.now()}`,
  );
  // Vite preview needs a moment after the API is up; avoids false timeouts under memory pressure.
  await new Promise((r) => setTimeout(r, 3000));
  await waitForHttp(
    `http://127.0.0.1:${STAGING_FRONTEND_PORT}/?ts=${Date.now()}`,
    HEALTH_TIMEOUT_MS,
  );

  const livePid = readPidFile(livePidFile);
  const stagingPid = readPidFile(stagingPidFile);
  appendMeta(
    `cutover: stop live pid=${livePid ?? 'none'} staging pid=${stagingPid ?? 'none'}`,
  );

  if (livePid) {
    await killTree(livePid, treeKill);
    try {
      fs.unlinkSync(livePidFile);
    } catch {
      /* ignore */
    }
  }
  if (stagingPid) {
    await killTree(stagingPid, treeKill);
    try {
      fs.unlinkSync(stagingPidFile);
    } catch {
      /* ignore */
    }
  }

  appendMeta('starting prod:serve on main ports');
  const prodPid = spawnDetachedNpm(['run', 'prod:serve'], livePidFile);
  appendMeta(`prod:serve pid=${prodPid}`);

  await waitForHttp(`http://127.0.0.1:3000/api/v1/health?ts=${Date.now()}`);
  await waitForHttp('http://127.0.0.1:4173/');

  appendMeta(
    'ensuring companion services (PM2, Discord bot, optional compose)',
  );
  await ensureCompanionServices({
    repoRoot,
    env: baseEnv(),
    appendLog: (line) =>
      appendMeta(line.replace(/^\[ensure-companion\]\s*/, '')),
  });
  try {
    await waitForHttp(`http://127.0.0.1:4174/?ts=${Date.now()}`, 15_000);
    appendMeta('echo-marketing healthy on :4174');
  } catch {
    appendMeta(
      'echo-marketing :4174 not reachable (may be unmanaged or still starting)',
    );
  }

  appendMeta('rolling deploy complete');
  console.log(
    '[prod-rolling] complete — live on :3000 / :4173, marketing on :4174',
  );
  console.log(`[prod-rolling] pid file: ${livePidFile}`);
  console.log(`[prod-rolling] log: ${metaPath}`);
}

main().catch((e) => {
  appendMeta(
    `rolling deploy failed: ${e instanceof Error ? e.message : String(e)}`,
  );
  console.error('[prod-rolling] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
