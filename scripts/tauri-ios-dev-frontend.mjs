#!/usr/bin/env node
/**
 * Tauri iOS `beforeDevCommand`:
 * - Default: start Vite with `VITE_API_URL` / `VITE_SOCKET_IO_URL` from `TAURI_DEV_HOST` (mobile dev).
 * - `ECHO_PRESTARTED_VITE=1`: only wait for an existing dev server on :8080, then stay alive until
 *   Tauri stops this process (used by `npm run tauri:ios:sim`).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import waitOn from 'wait-on';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const host = (process.env.TAURI_DEV_HOST || '127.0.0.1').replace(/\/$/, '');
const port = (process.env.VITE_DEV_ECHO_PORT || '3000').trim();

const env = {
  ...process.env,
  VITE_ECHO_TAURI: '1',
  VITE_API_URL: `http://${host}:${port}`,
  VITE_SOCKET_IO_URL: `http://${host}:${port}`,
  /** Smaller Vite dev footprint; set `ECHO_VITE_LOW_MEM=0` to disable. */
  ...(process.env.ECHO_VITE_LOW_MEM === '0' ? {} : { ECHO_VITE_LOW_MEM: '1' }),
};

async function main() {
  if (process.env.ECHO_PRESTARTED_VITE === '1') {
    await waitOn({
      resources: ['http-get://127.0.0.1:8080'],
      timeout: 120000,
      interval: 250,
    });
    await new Promise((resolve) => {
      process.once('SIGTERM', resolve);
      process.once('SIGINT', resolve);
    });
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'dev', '-w', 'frontend'], {
      cwd: root,
      stdio: 'inherit',
      env,
      shell: true,
    });
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`vite exited with ${code}`));
    });
    child.on('error', reject);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
