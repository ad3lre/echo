/**
 * Frees TCP ports used by `npm run dev` (or `npm run prod:serve` when `ECHO_FREE_PORTS` is set)
 * so a new run does not hit EADDRINUSE.
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const killPort = require('kill-port');

/** Backend (default), Discord bot internal server (default), Vite dev (vite.config.ts), Vite preview (frontend/package.json). */
const DEFAULT_PORTS = [3000, 3005, 8080, 4173];

function collectPorts() {
  const rawList = process.env.ECHO_FREE_PORTS?.trim();
  if (rawList) {
    const ports = rawList
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(ports)].sort((a, b) => a - b);
  }
  const set = new Set(DEFAULT_PORTS);
  const add = (raw) => {
    if (raw == null || raw === '') return;
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n > 0) set.add(n);
  };
  add(process.env.PORT);
  add(process.env.ECHO_DISCORD_BOT_INTERNAL_PORT);
  return [...set].sort((a, b) => a - b);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryListen(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (err) => resolve({ ok: false, code: err && err.code }));
    s.listen({ port, host }, () => {
      s.close(() => resolve({ ok: true }));
    });
  });
}

async function canBindPort(port) {
  const v4 = await tryListen(port, '0.0.0.0');
  if (!v4.ok) return false;

  const v6 = await tryListen(port, '::');
  if (v6.ok) return true;

  const c = v6.code;
  if (c === 'EADDRNOTAVAIL' || c === 'EAFNOSUPPORT' || c === 'EINVAL')
    return true;
  return false;
}

function tryLinuxFuserKill(port) {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function tryKillPortOnce(port) {
  try {
    await killPort(port);
  } catch {
    /* no listener or lsof missing */
  }
}

async function freePort(port) {
  await tryKillPortOnce(port);
  await delay(280);
  await tryKillPortOnce(port);
  await delay(280);
}

async function main() {
  const ports = collectPorts();
  for (const port of ports) {
    await freePort(port);
  }
  await delay(200);

  if (process.platform === 'linux') {
    for (const p of ports) {
      tryLinuxFuserKill(p);
    }
    await delay(450);
  }

  let busy = [];
  for (const port of ports) {
    if (!(await canBindPort(port))) busy.push(port);
  }

  if (busy.length > 0 && process.platform === 'linux') {
    console.warn(
      '[kill-dev-ports] Port(s) still busy; trying fuser (install `lsof` for kill-port to work reliably):',
      busy.join(', '),
    );
    for (const p of busy) {
      tryLinuxFuserKill(p);
    }
    await delay(450);
    busy = [];
    for (const port of ports) {
      if (!(await canBindPort(port))) busy.push(port);
    }
  }

  if (busy.length > 0) {
    const p = busy[0];
    console.error('');
    console.error('[kill-dev-ports] Cannot bind dev port(s):', busy.join(', '));
    console.error(
      '  Another stack may be running (`npm run dev` elsewhere), or `kill-port` could not find PIDs (install `lsof` on Linux: apt install lsof / apk add lsof).',
    );
    console.error(
      `  Or use a different API port: PORT=${p === 3000 ? 3001 : 3000} npm run dev`,
    );
    console.error('');
    process.exit(1);
  }

  for (const port of ports) {
    console.log(`[kill-dev-ports] ready TCP ${port}`);
  }
}

main().catch((e) => {
  console.error('[kill-dev-ports]', e);
  process.exit(1);
});
