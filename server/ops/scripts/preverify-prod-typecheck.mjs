#!/usr/bin/env bun
/**
 * Typecheck production workspaces before `bun run prod` tears down listening ports.
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
  '../../..',
);
const webRoot = path.join(repoRoot, 'clients/web');

function spawnOpts(cwd = repoRoot) {
  return {
    cwd,
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '1' },
    maxBuffer: 20 * 1024 * 1024,
  };
}

async function run(label, cmd, args, cwd = repoRoot) {
  console.log(`[preverify:prod] ${label}…`);
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, spawnOpts(cwd));
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
  console.log('[preverify:prod] checking web, backend, and bot…');

  try {
    await Promise.all([
      run('backend (tsc)', 'bun', ['run', '--filter', 'backend', 'build']),
      run('bot (tsc)', 'bun', ['run', '--filter', 'bot', 'build']),
    ]);
    await run('web (vue-tsc)', 'bun', ['x', 'vue-tsc', '--noEmit'], webRoot);
    await run('sql schema columns (static)', 'bun', [
      'run',
      'check:sql-schema-columns',
    ]);
    if (process.env.DATABASE_URL?.trim()) {
      await run('sql schema columns (live EXPLAIN)', 'bun', [
        'run',
        'check:sql-schema-columns:live',
      ]);
    } else {
      console.log(
        '[preverify:prod] DATABASE_URL unset — skipping live SQL EXPLAIN check',
      );
    }
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
