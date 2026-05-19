#!/usr/bin/env node
/**
 * Runs `tauri ios build` via the repo-local CLI (same pattern as `tauri-android-build.mjs`).
 * Frontend assets use `ECHO_TAURI_IOS=1` via `tauri.ios.conf.json` → `beforeBuildCommand`.
 *
 * Passthrough: arguments after `--` are forwarded (e.g. `-- --ci`).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tauriCliJs = path.join(
  repoRoot,
  'node_modules',
  '@tauri-apps',
  'cli',
  'tauri.js',
);

if (!fs.existsSync(tauriCliJs)) {
  console.error(
    '[tauri-ios-build] Missing @tauri-apps/cli at',
    tauriCliJs,
    '— run npm ci from the repo root.',
  );
  process.exit(1);
}

const dash = process.argv.indexOf('--');
/** Forward `npm run … -- --flags` (no `--` in argv) and `node script -- --flags`. */
const passthrough =
  dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [tauriCliJs, 'ios', 'build', ...passthrough],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      VITE_ECHO_TAURI: '1',
      VITE_ECHO_IOS: '1',
    },
    cwd: repoRoot,
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
