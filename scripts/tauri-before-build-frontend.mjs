#!/usr/bin/env node
/**
 * Tauri `beforeBuildCommand` entry.
 *
 * - Default: full `npm run build -w frontend` (vue-tsc + vite), same as before.
 * - Fast: `ECHO_TAURI_FAST_FRONTEND=1` → skip vue-tsc (still runs PWA icon pre-step + vite build).
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function runNodeScript(script) {
  const result = spawnSync('node', [script], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Twemoji WebP assets are gitignored and must exist before Vite copies public/.
runNodeScript('scripts/copy-twemoji.mjs');
runNodeScript('scripts/build-emoji-secondary-aliases.mjs');
runNodeScript('scripts/build-emoji-search-index.mjs');

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
      ? { VITE_ECHO_IOS: '1' }
      : { VITE_ECHO_DESKTOP: '1' }),
};

const result = spawnSync('npm', ['run', script, '-w', 'frontend'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 1);
