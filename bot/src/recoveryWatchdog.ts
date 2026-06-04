import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveNvmNodeBin(): string {
  const override = process.env.ECHO_NODE_BIN?.trim();
  if (override && existsSync(override)) return override;

  const repoRoot = process.env.ECHO_REPO_ROOT?.trim() || process.cwd();
  try {
    const rcPath = join(repoRoot, '.nvmrc');
    if (!existsSync(rcPath)) return process.execPath;
    const raw = readFileSync(rcPath, 'utf8').trim().split(/\s+/)[0];
    if (!raw) return process.execPath;
    const base = join(homedir(), '.nvm', 'versions', 'node');
    if (!existsSync(base)) return process.execPath;
    const want = raw.replace(/^v/, '');
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith('v') && d.slice(1).startsWith(want))
      .sort();
    if (!dirs.length) return process.execPath;
    const node = join(base, dirs[dirs.length - 1]!, 'bin', 'node');
    return existsSync(node) ? node : process.execPath;
  } catch {
    return process.execPath;
  }
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
  const script = join(repoRoot, 'scripts', 'echo-recovery-watchdog.mjs');
  if (!existsSync(script)) {
    console.warn(`[recovery-watchdog] missing script: ${script}`);
    return;
  }

  try {
    const nodeBin = resolveNvmNodeBin();
    const nvmBin = join(nodeBin, '..');
    const child = spawn(nodeBin, [script, `--reason=${reason}`], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `${nvmBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });
    child.unref();
    console.log(
      `[recovery-watchdog] spawned pid=${child.pid ?? '?'} (${reason})`,
    );
  } catch (e) {
    console.warn('[recovery-watchdog] spawn failed', e);
  }
}
