#!/usr/bin/env node
/**
 * Typecheck production workspaces before `npm run prod` tears down listening ports.
 * Fails fast so a broken deploy does not stop the running stack (see preprod without kill-port).
 *
 * Env:
 *   VPS_SKIP_PROD_TYPECHECK=1 — skip (emergency only)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function spawnOpts() {
  return {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '1' },
    maxBuffer: 20 * 1024 * 1024,
  };
}

async function run(label, args) {
  console.log(`[preverify:prod] ${label}…`);
  try {
    const { stdout, stderr } = await execFileAsync(npmCmd(), args, spawnOpts());
    if (stdout?.trim()) process.stdout.write(stdout);
    if (stderr?.trim()) process.stderr.write(stderr);
  } catch (e) {
    const stdout = e.stdout?.toString?.() ?? '';
    const stderr = e.stderr?.toString?.() ?? '';
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    throw e;
  }
}

async function main() {
  if (process.env.VPS_SKIP_PROD_TYPECHECK === '1') {
    console.warn('[preverify:prod] skipped (VPS_SKIP_PROD_TYPECHECK=1)');
    return;
  }

  const started = Date.now();
  console.log('[preverify:prod] checking frontend, backend, and bot…');

  try {
    await Promise.all([
      run('backend (tsc)', ['run', 'build', '-w', 'backend']),
      run('bot (tsc)', ['run', 'build', '-w', 'bot']),
    ]);
    await run('frontend (vue-tsc)', [
      'exec',
      '-w',
      'frontend',
      '--',
      'vue-tsc',
      '--noEmit',
    ]);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? e.code : 1;
    console.error(
      '\n[preverify:prod] FAILED — deploy aborted. The running prod stack was not restarted.',
    );
    console.error(
      '[preverify:prod] Fix TypeScript errors above, then redeploy.',
    );
    process.exit(typeof code === 'number' ? code : 1);
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[preverify:prod] ok (${sec}s)`);
}

main().catch((e) => {
  console.error('[preverify:prod] fatal:', e);
  process.exit(1);
});
