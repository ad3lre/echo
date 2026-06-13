/**
 * Start companion production processes when they are down — never restart healthy ones.
 * Used at the end of deploy / rolling cutover (not recovery, which intentionally restarts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { config as loadDotenv } from 'dotenv';
import { parseIntegerInRange } from './number-parse.mjs';
import {
  baseEnv,
  nodeBin,
  resolveLogDir,
  resolveRepoRoot,
} from './echo-recovery-core.mjs';

const execFileAsync = promisify(execFile);

/** PM2 apps that usually run beside prod:serve / blue-green API (not the main API/SPA). */
export const DEFAULT_PM2_COMPANION_APPS = [
  'echo-marketing',
  'echo-discord-bot',
  'echo-watchdog',
  'echo-video-hls-worker',
];

function parseCsvEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function logLine(prefix, msg, appendLog) {
  const line = `${prefix} ${msg}`;
  if (appendLog) appendLog(line);
  else console.log(line);
}

async function pm2Jlist(env) {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], {
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function pm2StatusFromList(list, name) {
  if (!list) return 'pm2_unavailable';
  const proc = list.find((p) => p.name === name);
  if (!proc) return 'missing';
  const st = proc.pm2_env?.status;
  if (st === 'online') return 'online';
  if (st === 'stopped' || st === 'stopping') return 'stopped';
  return st || 'unknown';
}

async function pm2StartRegistered(name, repoRoot, env) {
  await execFileAsync('pm2', ['start', name], { cwd: repoRoot, env });
}

async function pm2StartFromEcosystem(name, repoRoot, env) {
  const eco = path.join(repoRoot, 'ecosystem.config.cjs');
  if (!fs.existsSync(eco)) {
    throw new Error(`ecosystem.config.cjs missing at ${eco}`);
  }
  await execFileAsync('pm2', ['start', eco, '--only', name], {
    cwd: repoRoot,
    env,
  });
}

/**
 * @returns {'started'|'skipped'|'unavailable'}
 */
export async function ensurePm2App(name, opts = {}) {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const env = opts.env ?? baseEnv(repoRoot);
  const prefix = opts.logPrefix ?? '[ensure-companion]';
  const appendLog = opts.appendLog;

  const list = await pm2Jlist(env);
  if (!list) {
    logLine(prefix, `PM2 unavailable — skipped ${name}`, appendLog);
    return 'unavailable';
  }

  const status = pm2StatusFromList(list, name);
  if (status === 'online') {
    logLine(prefix, `PM2 ${name} already online — skip`, appendLog);
    return 'skipped';
  }

  try {
    if (status === 'missing') {
      await pm2StartFromEcosystem(name, repoRoot, env);
    } else {
      await pm2StartRegistered(name, repoRoot, env);
    }
    logLine(prefix, `PM2 ${name} started (was ${status})`, appendLog);
    return 'started';
  } catch (e) {
    if (status !== 'missing') {
      try {
        await pm2StartFromEcosystem(name, repoRoot, env);
        logLine(
          prefix,
          `PM2 ${name} started from ecosystem (was ${status})`,
          appendLog,
        );
        return 'started';
      } catch {
        /* fall through */
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    logLine(prefix, `PM2 ${name} start failed: ${msg}`, appendLog);
    return 'unavailable';
  }
}

export async function ensurePm2Apps(names, opts = {}) {
  const results = {};
  for (const name of names) {
    results[name] = await ensurePm2App(name, opts);
  }
  return results;
}

function loadRepoEnv(repoRoot) {
  const envPath = path.join(repoRoot, '.env');
  const envLocal = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envPath)) loadDotenv({ path: envPath });
  if (fs.existsSync(envLocal)) loadDotenv({ path: envLocal, override: true });
}

function readDiscordBotToken(repoRoot) {
  loadRepoEnv(repoRoot);
  const fromEnv = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return '';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?DISCORD_BOT_TOKEN\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v.trim();
  }
  return '';
}

function discordBotInternalPort(repoRoot) {
  loadRepoEnv(repoRoot);
  return parseIntegerInRange(
    process.env.ECHO_DISCORD_BOT_INTERNAL_PORT,
    3005,
    1,
    65_535,
  );
}

function discordBotInternalHost(repoRoot) {
  loadRepoEnv(repoRoot);
  return process.env.ECHO_DISCORD_BOT_INTERNAL_HOST?.trim() || '127.0.0.1';
}

export async function isDiscordBotHealthy(repoRoot = resolveRepoRoot()) {
  const host = discordBotInternalHost(repoRoot);
  const port = discordBotInternalPort(repoRoot);
  const url = `http://${host}:${port}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

function discordBotPidFile(repoRoot) {
  return path.join(resolveLogDir(repoRoot), 'echo-discord-bot.pid');
}

function readPid(pidFile) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnDetachedDiscordBot(repoRoot, env, logDir) {
  const botEntry = path.join(repoRoot, 'bot', 'dist', 'index.js');
  if (!fs.existsSync(botEntry)) {
    throw new Error(`bot bundle missing: ${botEntry}`);
  }
  fs.mkdirSync(logDir, { recursive: true });
  const outFd = fs.openSync(
    path.join(logDir, 'echo-discord-bot.stdout.log'),
    'a',
  );
  const errFd = fs.openSync(
    path.join(logDir, 'echo-discord-bot.stderr.log'),
    'a',
  );
  const envFile = path.join(repoRoot, '.env');
  const execArgs = [];
  if (fs.existsSync(envFile)) execArgs.push('--env-file', envFile);
  execArgs.push(botEntry, '--serve');

  const child = spawn(nodeBin(repoRoot), execArgs, {
    cwd: repoRoot,
    env: { ...env, NODE_ENV: 'production' },
    detached: true,
    stdio: ['ignore', outFd, errFd],
  });
  child.unref();
  if (!child.pid) throw new Error('failed to spawn discord bot');
  fs.writeFileSync(discordBotPidFile(repoRoot), `${child.pid}\n`, 'utf8');
  try {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  } catch {
    /* ignore */
  }
  return child.pid;
}

/**
 * @returns {'started'|'skipped'|'unavailable'}
 */
export async function ensureDiscordBot(opts = {}) {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const env = opts.env ?? baseEnv(repoRoot);
  const prefix = opts.logPrefix ?? '[ensure-companion]';
  const appendLog = opts.appendLog;
  const logDir = opts.logDir ?? resolveLogDir(repoRoot);

  if (await isDiscordBotHealthy(repoRoot)) {
    logLine(prefix, 'Discord bot healthy — skip', appendLog);
    return 'skipped';
  }

  for (let i = 0; i < 20; i++) {
    await delay(500);
    if (await isDiscordBotHealthy(repoRoot)) {
      logLine(prefix, 'Discord bot became healthy — skip', appendLog);
      return 'skipped';
    }
  }

  const pidFile = discordBotPidFile(repoRoot);
  const existingPid = readPid(pidFile);
  if (pidAlive(existingPid)) {
    logLine(
      prefix,
      `Discord bot pid=${existingPid} running (health pending) — skip`,
      appendLog,
    );
    return 'skipped';
  }

  const token = readDiscordBotToken(repoRoot);
  if (!token) {
    logLine(prefix, 'Discord bot skipped (DISCORD_BOT_TOKEN unset)', appendLog);
    return 'unavailable';
  }

  const pm2Result = await ensurePm2App('echo-discord-bot', {
    repoRoot,
    env,
    prefix,
    appendLog,
  });
  if (pm2Result === 'started' || pm2Result === 'skipped') {
    for (let i = 0; i < 30; i++) {
      if (await isDiscordBotHealthy(repoRoot)) {
        logLine(prefix, 'Discord bot healthy via PM2', appendLog);
        return pm2Result;
      }
      await delay(500);
    }
    if (pm2Result === 'skipped') {
      logLine(
        prefix,
        'Discord bot PM2 online but health pending — skip detached spawn',
        appendLog,
      );
      return 'skipped';
    }
  }

  if (pm2Result !== 'unavailable') {
    logLine(
      prefix,
      'Discord bot PM2 start pending health — skip detached spawn',
      appendLog,
    );
    return pm2Result;
  }

  try {
    const pid = spawnDetachedDiscordBot(repoRoot, env, logDir);
    logLine(
      prefix,
      `Discord bot started pid=${pid} (PM2 unavailable fallback)`,
      appendLog,
    );
    return 'started';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(prefix, `Discord bot start failed: ${msg}`, appendLog);
    return 'unavailable';
  }
}

function composeScript(repoRoot) {
  return path.join(repoRoot, 'scripts', 'compose.mjs');
}

function isComposeServiceRunning(service, repoRoot) {
  const script = composeScript(repoRoot);
  if (!fs.existsSync(script)) return null;
  const r = spawnSync(process.execPath, [script, 'ps', '-q', service], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  });
  const id = (r.stdout || '').trim().split('\n')[0]?.trim();
  if (!id) return false;
  const inspect = spawnSync(
    'docker',
    ['inspect', '-f', '{{.State.Running}}', id],
    {
      encoding: 'utf8',
    },
  );
  return inspect.stdout?.trim() === 'true';
}

async function ensureComposeService(service, repoRoot, env, prefix, appendLog) {
  const running = isComposeServiceRunning(service, repoRoot);
  if (running === null) {
    logLine(prefix, `compose helper missing — skipped ${service}`, appendLog);
    return 'unavailable';
  }
  if (running) {
    logLine(prefix, `compose ${service} already running — skip`, appendLog);
    return 'skipped';
  }
  const script = composeScript(repoRoot);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, 'up', '-d', service], {
      cwd: repoRoot,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`compose up ${service} exit ${code}`)),
    );
  });
  logLine(prefix, `compose ${service} started`, appendLog);
  return 'started';
}

/**
 * Ensure PM2 companions, Discord bot, and optional Compose services are up.
 */
export async function ensureCompanionServices(opts = {}) {
  const repoRoot = opts.repoRoot ?? resolveRepoRoot();
  const env = opts.env ?? baseEnv(repoRoot);
  const prefix = opts.logPrefix ?? '[ensure-companion]';
  const appendLog = opts.appendLog;

  const pm2Apps =
    opts.pm2Apps ??
    parseCsvEnv('ECHO_DEPLOY_COMPANION_PM2', DEFAULT_PM2_COMPANION_APPS);
  const composeServices =
    opts.composeServices ??
    parseCsvEnv('ECHO_DEPLOY_ENSURE_COMPOSE_SERVICES', []);

  logLine(
    prefix,
    'Ensuring companion services (no restarts when already up)',
    appendLog,
  );

  const pm2 = await ensurePm2Apps(pm2Apps, {
    repoRoot,
    env,
    prefix,
    appendLog,
  });
  const discordBot = await ensureDiscordBot({
    repoRoot,
    env,
    prefix,
    appendLog,
    logDir: opts.logDir,
  });

  const compose = {};
  for (const service of composeServices) {
    compose[service] = await ensureComposeService(
      service,
      repoRoot,
      env,
      prefix,
      appendLog,
    );
  }

  return { pm2, discordBot, compose };
}
