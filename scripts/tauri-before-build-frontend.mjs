#!/usr/bin/env node
/**
 * Tauri `beforeBuildCommand` entry.
 *
 * - Default: full `npm run build -w frontend` (vue-tsc + vite), same as before.
 * - Fast: `ECHO_TAURI_FAST_FRONTEND=1` → skip vue-tsc (still runs PWA icon pre-step + vite build).
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const fast = process.env.ECHO_TAURI_FAST_FRONTEND === '1';
const script = fast ? 'build:no-typecheck' : 'build';

const isAndroid = process.env.ECHO_TAURI_ANDROID === '1';
const isIos = process.env.ECHO_TAURI_IOS === '1';
const env = {
  ...process.env,
  VITE_ECHO_TAURI: '1',
  ...(isAndroid
    ? { VITE_ECHO_ANDROID: '1' }
    : isIos
      ? {}
      : { VITE_ECHO_DESKTOP: '1' }),
};

const result = spawnSync('npm', ['run', script, '-w', 'frontend'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 1);
