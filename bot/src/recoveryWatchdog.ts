import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveBunBin(): string {
  const override = process.env.ECHO_BUN_BIN?.trim() || process.env.ECHO_NODE_BIN?.trim();
  if (override && existsSync(override)) return override;

  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin', 'bun') : '',
    join(homedir(), '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/usr/bin/bun',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return process.execPath;
}

/**
 * Spawn the VPS recovery watchdog when Discord uptime flips healthy → down.
 * No-op unless ECHO_RECOVERY_WATCHDOG_ENABLED=1 (keeps dev laptops quiet).
 */
export function triggerRecoveryWatchdog(reason: string): void {
  if (process.env.ECHO_RECOVERY_WATCHDOG_ENABLED?.trim() !== '1') {
    return;
  }

  const repoRoot = process.env.ECHO_REPO_ROOT?.trim() || process.cwd();
  const script = join(
    repoRoot,
    'server/ops/scripts',
    'echo-recovery-watchdog.mjs',
  );
  if (!existsSync(script)) {
    console.warn(`[recovery-watchdog] missing script: ${script}`);
    return;
  }

  try {
    const bunBin = resolveBunBin();
    const bunDir = join(bunBin, '..');
    const child = spawn(bunBin, [script, `--reason=${reason}`], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `${bunDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });
    child.on('error', (e) =>
      console.warn('[recovery-watchdog] spawn failed', e),
    );
    child.unref();
    console.warn(
      `[recovery-watchdog] spawned pid=${child.pid ?? '?'} (${reason})`,
    );
  } catch (e) {
    console.warn('[recovery-watchdog] spawn failed', e);
  }
}
