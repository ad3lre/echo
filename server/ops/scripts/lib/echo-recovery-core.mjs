import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { config as loadDotenv } from 'dotenv';
import { parseIntegerInRange } from './number-parse.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveRepoRoot() {
  return path.resolve(
    process.env.ECHO_REPO_ROOT?.trim() || path.join(__dirname, '../..', '..'),
  );
}

export function resolveLogDir(repoRoot = resolveRepoRoot()) {
  return path.join(repoRoot, 'logs', 'vps');
}

export function resolveLivePidFile(repoRoot = resolveRepoRoot()) {
  return path.join(resolveLogDir(repoRoot), 'echo-vps-prod.pid');
}

export function loadEnv(repoRoot = resolveRepoRoot()) {
  const envPath = path.join(repoRoot, '.env');
  const envLocal = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envPath)) loadDotenv({ path: envPath });
  if (fs.existsSync(envLocal)) loadDotenv({ path: envLocal, override: true });
}

export function appendRecoveryLog(line, metaPath) {
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.appendFileSync(
    metaPath,
    `[${new Date().toISOString()}] ${line}\n`,
    'utf8',
  );
}

function nvmNodeBinDir(repoRoot) {
  try {
    const rcPath = path.join(repoRoot, '.nvmrc');
    if (!fs.existsSync(rcPath)) return '';
    const raw = fs.readFileSync(rcPath, 'utf8').trim().split(/\s+/)[0];
    if (!raw) return '';
    const base = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (!fs.existsSync(base)) return '';
    const want = raw.replace(/^v/, '');
    const dirs = fs
      .readdirSync(base)
      .filter((d) => d.startsWith('v') && d.slice(1).startsWith(want));
    if (!dirs.length) return '';
    dirs.sort();
    const bin = path.join(base, dirs[dirs.length - 1], 'bin');
    return fs.existsSync(path.join(bin, 'node')) ? bin : '';
  } catch {
    return '';
  }
}

export function baseEnv(repoRoot = resolveRepoRoot()) {
  const nvmBin = nvmNodeBinDir(repoRoot);
  const pathParts = nvmBin
    ? [
        nvmBin,
        '/usr/local/sbin',
        '/usr/local/bin',
        '/usr/sbin',
        '/usr/bin',
        '/sbin',
        '/bin',
      ]
    : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return {
    ...process.env,
    FORCE_COLOR: '0',
    PATH: pathParts.join(path.delimiter),
  };
}

export function npmBin(repoRoot = resolveRepoRoot()) {
  const binDir = nvmNodeBinDir(repoRoot);
  if (binDir) {
    const npm = path.join(
      binDir,
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
    );
    if (fs.existsSync(npm)) return npm;
  }
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function nodeBin(repoRoot = resolveRepoRoot()) {
  const binDir = nvmNodeBinDir(repoRoot);
  if (binDir) {
    const node = path.join(binDir, 'node');
    if (fs.existsSync(node)) return node;
  }
  return process.execPath;
}

export async function localApiHealthy(
  localHealthUrl = process.env.ECHO_WATCHDOG_LOCAL_HEALTH_URL?.trim() ||
    'http://127.0.0.1:3000/api/v1/health',
) {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(`${localHealthUrl}?ts=${Date.now()}`, {
      cache: 'no-store',
      signal: ac.signal,
    });
    clearTimeout(to);
    return res.ok;
  } catch {
    return false;
  }
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
    await new Promise((r) => setTimeout(r, 2000));
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* ESRCH */
  }
  await new Promise((r) => setTimeout(r, 2000));
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

async function freeProdPorts(repoRoot, env) {
  const killer = path.join(
    repoRoot,
    'server',
    'ops',
    'scripts',
    'kill-dev-ports.mjs',
  );
  await new Promise((resolve, reject) => {
    const child = spawn(nodeBin(repoRoot), [killer], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...env,
        ECHO_FREE_PORTS: '3000,4173,3005,3001,4174,4175',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`kill-dev-ports exit ${code}`)),
    );
  });
}

function spawnDetachedProdServe(repoRoot, logDir, livePidFile, env) {
  const outPath = path.join(logDir, 'prod.rolling.stdout.log');
  const errPath = path.join(logDir, 'prod.rolling.stderr.log');
  fs.mkdirSync(logDir, { recursive: true });
  const outFd = fs.openSync(outPath, 'a');
  const errFd = fs.openSync(errPath, 'a');
  const child = spawn(npmBin(repoRoot), ['run', 'prod:serve'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env,
    shell: false,
  });
  try {
    child.unref();
  } catch {
    /* ignore */
  }
  fs.writeFileSync(livePidFile, `${child.pid}\n`, 'utf8');
  try {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  } catch {
    /* ignore */
  }
  return child.pid;
}

async function pm2RestartMarketing(repoRoot, env) {
  try {
    await execFileAsync('pm2', ['restart', 'echo-marketing'], {
      cwd: repoRoot,
      env,
    });
    return true;
  } catch {
    return false;
  }
}

async function pm2RestartAll(repoRoot, env) {
  const apps = [
    'echo-backend',
    'echo-web',
    'echo-video-hls-worker',
    'echo-marketing',
    'echo-discord-bot',
    'echo-watchdog',
  ];
  let any = false;
  for (const name of apps) {
    try {
      await execFileAsync('pm2', ['restart', name], { cwd: repoRoot, env });
      any = true;
    } catch {
      /* app may not be registered */
    }
  }
  return any;
}

export async function waitForHealthy(timeoutMs, localHealthUrl) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await localApiHealthy(localHealthUrl)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Stop live prod:serve, free ports, restart prod:serve + PM2 apps, wait for health.
 */
export async function restartProdStack(opts = {}) {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const logDir = opts.logDir ?? resolveLogDir(repoRoot);
  const livePidFile = opts.livePidFile ?? resolveLivePidFile(repoRoot);
  const appendMeta = opts.appendMeta ?? (() => {});
  const env = opts.env ?? baseEnv(repoRoot);
  const localHealthUrl = opts.localHealthUrl;

  const treeKill = await loadTreeKill();
  const livePid = readPidFile(livePidFile);
  appendMeta(`restart: stop live pid=${livePid ?? 'none'}`);
  if (livePid) await killTree(livePid, treeKill);
  await freeProdPorts(repoRoot, env);
  const newPid = spawnDetachedProdServe(repoRoot, logDir, livePidFile, env);
  appendMeta(`restart: prod:serve pid=${newPid}`);
  if (await pm2RestartAll(repoRoot, env)) {
    appendMeta('restart: pm2 apps restarted');
  } else if (await pm2RestartMarketing(repoRoot, env)) {
    appendMeta('restart: pm2 echo-marketing restarted');
  }
  const ok = await waitForHealthy(120_000, localHealthUrl);
  return { newPid, apiOk: ok };
}

export async function sendRecoveryEmail(report, opts = {}) {
  const notifyEmail =
    opts.notifyEmail?.trim() ||
    process.env.ECHO_WATCHDOG_NOTIFY_EMAIL?.trim() ||
    'support@chat-echo.com';
  const appendMeta = opts.appendMeta ?? (() => {});

  const host = process.env.ECHO_SMTP_HOST?.trim();
  if (!host) {
    appendMeta('email skipped: ECHO_SMTP_HOST unset');
    return { sent: false, error: 'ECHO_SMTP_HOST unset' };
  }
  const port = parseIntegerInRange(process.env.ECHO_SMTP_PORT, 587, 1, 65_535);
  const secure = process.env.ECHO_SMTP_SECURE === 'true';
  const user = process.env.ECHO_SMTP_USER?.trim() || '';
  const pass = process.env.ECHO_SMTP_PASSWORD ?? '';
  const from =
    process.env.ECHO_EMAIL_FROM?.trim() || 'Echo <noreply@chat-echo.com>';

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user || pass ? { auth: { user, pass } } : {}),
  });

  const subject =
    opts.subject ||
    `[Echo VPS] Recovery — ${report.outcome ?? report.status ?? 'update'}`;
  const text =
    opts.text ||
    [
      'Echo production recovery report.',
      '',
      ...Object.entries(report).map(([k, v]) => `${k}: ${v}`),
      '',
      `Host: ${os.hostname()}`,
      `Time (UTC): ${new Date().toISOString()}`,
      '',
      '— Echo recovery',
    ].join('\n');

  try {
    await transport.sendMail({
      from,
      to: notifyEmail,
      subject,
      text,
    });
    appendMeta(`email sent to ${notifyEmail}`);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendMeta(`email failed: ${msg}`);
    return { sent: false, error: msg };
  }
}
