/**
 * Frees TCP ports used by `npm run dev` (or `npm run prod:serve` when `ECHO_FREE_PORTS` is set)
 * so a new run does not hit EADDRINUSE.
 *
 * The `kill-port` package uses `lsof` on macOS/Linux. On minimal Linux images `lsof`
 * is often missing — kills no-op and the backend then dies with EADDRINUSE. This script:
 * - Runs kill-port twice per port with settle delays
 * - On Linux, runs `fuser -k PORT/tcp` once for every listed port before verification (covers
 *   no-lsof setups and IPv6 listeners); if still busy, retries fuser on busy ports only
 *   (avoid mapping unrelated services to these ports on the same host)
 * - Verifies each port can be bound before exiting; if not, prints hints and exits 1 so
 *   `concurrently` does not start a backend doomed to fail on listen()
 */
const killPort = require('kill-port');
const net = require('net');
const { execFileSync } = require('child_process');

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

/**
 * Port is free only if both IPv4 and IPv6 binds succeed (when IPv6 exists).
 * A listener on [::]:PORT alone can leave 0.0.0.0:PORT bind succeeding on some stacks.
 */
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

  // Linux: always SIGKILL listeners on listed ports once. kill-port often no-ops without lsof;
  // fuser catches IPv6-only listeners that an IPv4-only bind check can miss.
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
