/**
 * After `npm run build -w backend`, starts the compiled backend on a high port and GETs /api/v1/health.
 * Invoked from `npm run ship:verify`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'backend', 'dist', 'backend', 'src', 'index.js');

const PORT = process.env.SHIP_VERIFY_PORT ?? '30999';
const HOST = '127.0.0.1';
const url = `http://${HOST}:${PORT}/api/v1/health`;

const env = {
  ...process.env,
  PORT,
  HOST,
  ECHO_BACKEND_STORAGE: 'memory',
  DATABASE_URL: '',
  USE_MOCK_DB: 'true',
  NODE_ENV: 'development',
};

const child = spawn(process.execPath, [entry], {
  env,
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr?.on('data', (c) => {
  stderr += c.toString();
});

function killTree() {
  if (!child.pid) return;
  child.kill('SIGTERM');
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
      stdio: 'ignore',
    }).on('error', () => {});
  }
}

const deadline = Date.now() + 45_000;
let ok = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      ok = true;
      break;
    }
  } catch {
    // still starting
  }
  await delay(500);
}

killTree();

if (!ok) {
  console.error('ship-verify-smoke: health check failed for', url);
  if (stderr) console.error(stderr.slice(-4000));
  process.exit(1);
}

console.log('ship-verify-smoke: ok', url);
