/**
 * Runs before `npm run dev` (package.json `predev`).
 * Set ECHO_DEV_SKIP_SETUP=1 (or run `npm run dev:quick`) to skip Docker/DB/emoji
 * work when the stack is already up and assets are built — much faster restarts.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// `dirname(URL('.', import.meta.url))` strips *two* levels (scripts → echo → ..),
// which breaks when the repo lives under another folder (e.g. ~/prod/echo).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function run(cmd) {
  execSync(cmd, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
}

if (
  process.env.ECHO_DEV_SKIP_SETUP === '1' ||
  process.env.ECHO_DEV_QUICK === '1'
) {
  console.log(
    '[dev] Skipping setup (ECHO_DEV_SKIP_SETUP / dev:quick). Ensure Docker DB is up if the backend needs it.',
  );
  process.exit(0);
}

run(
  [
    'node server/ops/scripts/ensure-docker.mjs',
    'npm run db:up',
    'node server/ops/scripts/copy-twemoji.mjs',
    'node server/ops/scripts/build-emoji-secondary-aliases.mjs',
    'node server/ops/scripts/build-emoji-search-index.mjs',
    'node server/ops/scripts/diagnostics-prune.mjs',
  ].join(' && '),
);
