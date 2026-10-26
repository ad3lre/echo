#!/usr/bin/env bun
/**
 * VPS-oriented runner for `bun run dev` / `bun run prod`.
 *
 * Without --foreground: start the stack detached from the TTY, append logs under --log-dir,
 * write a PID file, then exit the launcher (survives SSH disconnect).
 *
 * --git-watch: keep the launcher running; poll git, and when origin moves, stop the stack,
 * `git pull --ff-only`, optionally `bun install`, and start again.
 *
 * --foreground: do not exit the launcher after starting (and for non-watch, wait on the child
 * with stdio inherited — useful for debugging).
 *
 * Env:
 *   VPS_GIT_POLL_MS - poll interval for --git-watch (default 60000)
 *   VPS_BUN_INSTALL_AFTER_PULL - set to "1" to run `bun install` after each successful pull
 *   VPS_NPM_INSTALL_AFTER_PULL - legacy alias for VPS_BUN_INSTALL_AFTER_PULL
 *   ECHO_DEPLOY_REQUIRE_SIGNED - "1" to `git verify-commit` the new tip before pulling/restarting
 *     (default off, loud warning each pull); ECHO_DEPLOY_ALLOWED_SIGNERS overrides gpg.ssh.allowedSignersFile
 *   VPS_SKIP_PROD_TYPECHECK - set to "1" to skip pre-deploy TypeScript checks (emergency only)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Prefer the repo Bun install (`~/.bun/bin`) when the shell `bun` is missing or wrong.
 */
function bunBinDir() {
  try {
    const candidates = [
      process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin') : '',
      path.join(os.homedir(), '.bun', 'bin'),
    ].filter(Boolean);
    for (const bin of candidates) {
      if (fs.existsSync(path.join(bin, 'bun'))) return bin;
    }
    return '';
  } catch {
    return '';
  }
}

function printHelp() {
  console.error(`
Usage: bun server/ops/scripts/vps-serve.mjs <dev|prod> [options]

Options:
  --git-watch       Poll origin and restart when new commits appear (launcher stays running)
  --daemon          With --git-watch: detach the launcher itself and exit (survives SSH disconnect)
  --foreground      Do not detach: stay attached (non-watch: wait with inherited stdio)
  --stop            Stop the running stack / watcher (uses pid files under --log-dir)
  --watch-branch=B  With --git-watch: watch/pull this branch (default: current branch; error if detached HEAD)
  --log-dir=DIR     Log directory (default: <repo>/logs/vps)
  --poll-ms=N       Git poll interval in ms (default: 60000 or VPS_GIT_POLL_MS; min 5000)

Examples:
  bun run vps -- prod
  bun run vps -- dev --foreground
  bun run vps -- prod --git-watch
  bun run vps -- dev --git-watch --daemon
  bun run vps -- prod --git-watch --watch-branch=release/1.0.0
`);
}

function parseArgs(argv) {
  const out = {
    mode: null,
    gitWatch: false,
    daemon: false,
    foreground: false,
    stop: false,
    watchBranch: null,
    logDir: path.join(repoRoot, 'logs', 'vps'),
    pollMs: parseInt(process.env.VPS_GIT_POLL_MS || '60000', 10) || 60_000,
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--git-watch') out.gitWatch = true;
    else if (a === '--daemon') out.daemon = true;
    else if (a === '--foreground') out.foreground = true;
    else if (a === '--stop') out.stop = true;
    else if (a.startsWith('--watch-branch='))
      out.watchBranch = a.slice('--watch-branch='.length);
    else if (a.startsWith('--log-dir='))
      out.logDir = path.resolve(a.slice('--log-dir='.length));
    else if (a.startsWith('--poll-ms=')) {
      const n = parseInt(a.slice('--poll-ms='.length), 10);
      if (Number.isFinite(n) && n >= 5000) out.pollMs = n;
    } else if (!a.startsWith('-')) {
      if (a === 'dev' || a === 'prod') out.mode = a;
    }
  }
  if (!out.mode) {
    printHelp();
    process.exit(1);
  }
  if (out.daemon && !out.gitWatch) {
    console.error('[vps-serve] --daemon requires --git-watch');
    process.exit(1);
  }
  return out;
}

function bunCmd() {
  const dir = bunBinDir();
  if (dir) return path.join(dir, 'bun');
  return 'bun';
}

async function loadTreeKill() {
  try {
    const mod = await import('tree-kill');
    return mod.default;
  } catch {
    return null;
  }
}

async function killTree(pid, treeKill) {
  if (treeKill) {
    await new Promise((resolve) => {
      treeKill(pid, 'SIGTERM', () => resolve());
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* ESRCH */
  }
}

function openLogs(logDir, mode) {
  fs.mkdirSync(logDir, { recursive: true });
  const outPath = path.join(logDir, `${mode}.stdout.log`);
  const errPath = path.join(logDir, `${mode}.stderr.log`);
  const metaPath = path.join(logDir, `${mode}.launcher.log`);
  return {
    outFd: fs.openSync(outPath, 'a'),
    errFd: fs.openSync(errPath, 'a'),
    metaPath,
    outPath,
    errPath,
  };
}

function writePid(logDir, mode, pid) {
  fs.mkdirSync(logDir, { recursive: true });
  const pidFile = path.join(logDir, `echo-vps-${mode}.pid`);
  fs.writeFileSync(pidFile, `${pid}\n`, 'utf8');
  return pidFile;
}

function clearPid(logDir, mode) {
  try {
    fs.unlinkSync(path.join(logDir, `echo-vps-${mode}.pid`));
  } catch {
    /* absent */
  }
}

function watchPidPath(logDir, mode) {
  return path.join(logDir, `echo-vps-${mode}.watch.pid`);
}

function writeWatchPid(logDir, mode, pid) {
  fs.mkdirSync(logDir, { recursive: true });
  const pidFile = watchPidPath(logDir, mode);
  fs.writeFileSync(pidFile, `${pid}\n`, 'utf8');
  return pidFile;
}

function clearWatchPid(logDir, mode) {
  try {
    fs.unlinkSync(watchPidPath(logDir, mode));
  } catch {
    /* absent */
  }
}

function appendMeta(metaPath, line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(metaPath, `[${ts}] ${line}\n`, 'utf8');
}

/**
 * @param {{ mode: string; foreground: boolean; gitWatch: boolean; logDir: string }} opts
 * @param {{ outFd?: number; errFd?: number; metaPath?: string } | null} logReuse — if set, reuse fds (git-watch)
 */
function spawnNpmRun(opts, logReuse, treeKill) {
  const { mode, foreground, gitWatch } = opts;
  const logDir = opts.logDir;

  let logs;
  if (
    logReuse?.outFd != null &&
    logReuse?.errFd != null &&
    logReuse?.metaPath
  ) {
    logs = {
      outFd: logReuse.outFd,
      errFd: logReuse.errFd,
      metaPath: logReuse.metaPath,
      outPath: path.join(logDir, `${mode}.stdout.log`),
      errPath: path.join(logDir, `${mode}.stderr.log`),
    };
  } else {
    logs = openLogs(logDir, mode);
  }

  /** Detach bun from the launcher TTY (daemon one-shot, or git-watch supervisor). */
  const detachChild = !foreground || gitWatch;

  appendMeta(
    logs.metaPath,
    `spawn bun run ${mode} (foreground=${foreground}, gitWatch=${gitWatch}, detachChild=${detachChild})`,
  );

  const stdio =
    foreground && !gitWatch ? 'inherit' : ['ignore', logs.outFd, logs.errFd];

  const bunBin = bunBinDir();
  const env = { ...process.env, FORCE_COLOR: '0' };
  if (bunBin) {
    env.PATH = `${bunBin}${path.delimiter}${env.PATH}`;
    appendMeta(logs.metaPath, `PATH: prepended bun bin (${bunBin})`);
  }

  const child = spawn(bunCmd(), ['run', mode], {
    cwd: repoRoot,
    detached: detachChild,
    stdio,
    shell: process.platform === 'win32',
    env,
  });

  if (detachChild) {
    try {
      child.unref();
    } catch {
      /* ignore */
    }
  }

  const pidFile = writePid(logDir, mode, child.pid);

  child.on('exit', (code, signal) => {
    appendMeta(
      logs.metaPath,
      `bun run ${mode} exit code=${code} signal=${signal ?? 'none'}`,
    );
    clearPid(logDir, mode);
  });

  return { child, pidFile, logs, treeKill };
}

async function gitNeedsPull(branch) {
  await execFileAsync('git', ['fetch', 'origin'], { cwd: repoRoot });
  const { stdout: localOut } = await execFileAsync(
    'git',
    ['rev-parse', branch],
    {
      cwd: repoRoot,
    },
  );
  const local = localOut.trim();
  let remote;
  try {
    const { stdout: r } = await execFileAsync(
      'git',
      ['rev-parse', `origin/${branch}`],
      {
        cwd: repoRoot,
      },
    );
    remote = r.trim();
  } catch {
    return {
      need: false,
      branch,
      reason: `no origin/${branch} (push branch or set upstream)`,
    };
  }
  return { need: local !== remote, branch, local, remote };
}

/**
 * Signature verification of the commit about to be deployed.
 * ECHO_DEPLOY_REQUIRE_SIGNED=1 → refuse unsigned/untrusted commits (keep old version running).
 * Default (unset/0) is OFF for now because commits are not yet signed; a loud warning is logged.
 * Honors git's gpg.ssh.allowedSignersFile / gpg keyring; ECHO_DEPLOY_ALLOWED_SIGNERS overrides the file.
 * Returns true when deploy may proceed.
 */
async function verifyCommitBeforeDeploy(sha, metaPath) {
  const require = /^(1|true|yes)$/i.test(
    process.env.ECHO_DEPLOY_REQUIRE_SIGNED || '',
  );
  if (!require) {
    appendMeta(
      metaPath,
      `WARNING: deploying ${sha} WITHOUT signature verification (ECHO_DEPLOY_REQUIRE_SIGNED is not 1). A compromised remote can push code to production.`,
    );
    return true;
  }
  const args = [];
  if (process.env.ECHO_DEPLOY_ALLOWED_SIGNERS) {
    args.push(
      '-c',
      `gpg.ssh.allowedSignersFile=${process.env.ECHO_DEPLOY_ALLOWED_SIGNERS}`,
    );
  }
  args.push('verify-commit', sha);
  try {
    await execFileAsync('git', args, { cwd: repoRoot });
    appendMeta(metaPath, `git verify-commit ok for ${sha}`);
    return true;
  } catch (e) {
    const detail = String(e?.stderr || e?.message || e)
      .trim()
      .split('\n')
      .slice(-3)
      .join(' | ');
    appendMeta(
      metaPath,
      `git verify-commit FAILED for ${sha} — refusing to deploy, keeping current version running (${detail})`,
    );
    return false;
  }
}

async function gitPullFfOnly(branch) {
  await execFileAsync('git', ['pull', '--ff-only', 'origin', branch], {
    cwd: repoRoot,
  });
}

async function currentBranch() {
  const { stdout: br } = await execFileAsync(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    {
      cwd: repoRoot,
    },
  );
  return br.trim();
}

async function workingTreeIsClean() {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
  });
  return stdout.trim().length === 0;
}

async function maybeNpmInstallAfterPull(metaPath) {
  const enabled =
    process.env.VPS_BUN_INSTALL_AFTER_PULL === '1' ||
    process.env.VPS_NPM_INSTALL_AFTER_PULL === '1';
  if (!enabled) return;
  appendMeta(metaPath, 'running bun install (VPS_*_INSTALL_AFTER_PULL=1)');
  await execFileAsync(bunCmd(), ['install'], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
  });
}

/** Run before stopping prod so a type error does not take down the live stack. */
async function runProdTypecheckPreverify(metaPath) {
  if (process.env.VPS_SKIP_PROD_TYPECHECK === '1') {
    appendMeta(metaPath, 'preverify:prod skipped (VPS_SKIP_PROD_TYPECHECK=1)');
    return;
  }
  appendMeta(metaPath, 'preverify:prod — TypeScript check (web, backend, bot)');
  try {
    await execFileAsync(
      process.execPath,
      [
        path.join(
          repoRoot,
          'server',
          'ops',
          'scripts',
          'preverify-prod-typecheck.mjs',
        ),
      ],
      { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
    );
    appendMeta(metaPath, 'preverify:prod ok');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendMeta(metaPath, `preverify:prod failed: ${msg}`);
    throw e;
  }
}

async function runProdPreverifyOrExit(metaPath) {
  try {
    await runProdTypecheckPreverify(metaPath);
  } catch {
    appendMeta(metaPath, 'TypeScript preverify failed — aborting');
    console.error(
      '[vps-serve] prod TypeScript preverify failed — deploy aborted (stack unchanged).',
    );
    console.error('[vps-serve] see logs above or run: bun run preverify:prod');
    process.exit(1);
  }
}

async function watchLoop(opts, treeKill) {
  const { mode, logDir, pollMs } = opts;
  const logs = openLogs(logDir, mode);

  const br = opts.watchBranch ?? (await currentBranch());
  if (!br || br === 'HEAD') {
    appendMeta(
      logs.metaPath,
      'git watch: detached HEAD; pass --watch-branch=<branch>',
    );
    console.error(
      '[vps-serve] git watch requires a branch; pass --watch-branch=<branch>',
    );
    process.exit(1);
  }

  appendMeta(
    logs.metaPath,
    `git watch started (branch=${br}, pollMs=${pollMs})`,
  );
  writeWatchPid(logDir, mode, process.pid);

  let current = null;
  let stopping = false;

  const start = () => {
    current = spawnNpmRun(
      { ...opts, foreground: false, gitWatch: true },
      { outFd: logs.outFd, errFd: logs.errFd, metaPath: logs.metaPath },
      treeKill,
    );
    appendMeta(logs.metaPath, `stack pid=${current.child.pid}`);
  };

  const stopChild = async () => {
    if (!current?.child?.pid) return;
    appendMeta(logs.metaPath, `stopping pid ${current.child.pid}`);
    await killTree(current.child.pid, treeKill);
    await new Promise((r) => setTimeout(r, 1500));
    current = null;
  };

  start();

  const poll = async () => {
    if (stopping) return;
    try {
      const status = await gitNeedsPull(br);
      if (!status.need) return;

      const headBranch = await currentBranch();
      if (headBranch !== br) {
        appendMeta(
          logs.metaPath,
          `git: update available on ${br} (local=${status.local}, remote=${status.remote}) but HEAD is ${headBranch}; skipping pull`,
        );
        return;
      }

      const clean = await workingTreeIsClean();
      if (!clean) {
        appendMeta(
          logs.metaPath,
          `git: update available on ${br} (local=${status.local}, remote=${status.remote}) but working tree is dirty; skipping pull`,
        );
        return;
      }

      appendMeta(
        logs.metaPath,
        `git: new commits (${status.branch}) — pull, preverify, then restart`,
      );

      if (!(await verifyCommitBeforeDeploy(status.remote, logs.metaPath))) {
        return;
      }

      appendMeta(
        logs.metaPath,
        `git: restarting due to ${status.branch} update (local=${status.local}, remote=${status.remote})`,
      );

      await gitPullFfOnly(status.branch);
      await maybeNpmInstallAfterPull(logs.metaPath);
      appendMeta(logs.metaPath, 'git pull complete');

      if (mode === 'prod') {
        try {
          await runProdTypecheckPreverify(logs.metaPath);
        } catch {
          appendMeta(
            logs.metaPath,
            'git watch: TypeScript preverify failed — keeping current stack running',
          );
          return;
        }
      }

      await stopChild();
      appendMeta(logs.metaPath, 'restarting stack after successful preverify');
      start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendMeta(logs.metaPath, `git watch error: ${msg}`);
    }
  };

  const timer = setInterval(poll, pollMs);
  void poll();

  const shutdown = async () => {
    stopping = true;
    clearInterval(timer);
    await stopChild();
    try {
      fs.closeSync(logs.outFd);
      fs.closeSync(logs.errFd);
    } catch {
      /* ignore */
    }
    clearWatchPid(logDir, mode);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

function readPidFile(pidFile) {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

async function stopRunning(opts, treeKill) {
  const { mode, logDir } = opts;
  const logs = openLogs(logDir, mode);

  const watchPidFile = watchPidPath(logDir, mode);
  const stackPidFile = path.join(logDir, `echo-vps-${mode}.pid`);

  const watchPid = readPidFile(watchPidFile);
  const stackPid = readPidFile(stackPidFile);

  if (!watchPid && !stackPid) {
    console.log(`[vps-serve] nothing to stop (no pid files under ${logDir})`);
    return;
  }

  if (watchPid) {
    appendMeta(logs.metaPath, `stop: killing watcher pid=${watchPid}`);
    await killTree(watchPid, treeKill);
    clearWatchPid(logDir, mode);
  }

  if (stackPid) {
    appendMeta(logs.metaPath, `stop: killing stack pid=${stackPid}`);
    await killTree(stackPid, treeKill);
    clearPid(logDir, mode);
  }

  console.log('[vps-serve] stop signal sent; check logs for shutdown details');
}

function daemonizeGitWatchIfRequested(opts) {
  if (!opts.gitWatch || !opts.daemon) return null;
  if (process.env.VPS_DAEMON_CHILD === '1') return null;

  const rawArgs = process.argv.slice(2);
  const childArgs = rawArgs.filter((a) => a !== '--daemon');

  const child = spawn(process.execPath, [process.argv[1], ...childArgs], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VPS_DAEMON_CHILD: '1' },
  });

  try {
    child.unref();
  } catch {
    /* ignore */
  }

  return child.pid;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const treeKill = await loadTreeKill();

  if (opts.stop) {
    await stopRunning(opts, treeKill);
    return;
  }

  if (opts.gitWatch) {
    const daemonPid = daemonizeGitWatchIfRequested(opts);
    if (daemonPid) {
      fs.mkdirSync(opts.logDir, { recursive: true });
      console.log(
        `[vps-serve] started git-watch launcher in background (pid=${daemonPid})`,
      );
      console.log(
        `[vps-serve] watcher pid file: ${watchPidPath(opts.logDir, opts.mode)}`,
      );
      console.log(
        `[vps-serve] logs: ${path.join(opts.logDir, `${opts.mode}.launcher.log`)}`,
      );
      console.log(`[vps-serve] you can close this terminal.`);
      return;
    }
    await watchLoop(opts, treeKill);
    return;
  }

  const logs = openLogs(opts.logDir, opts.mode);
  if (opts.mode === 'prod') {
    await runProdPreverifyOrExit(logs.metaPath);

    const stackPidFile = path.join(opts.logDir, `echo-vps-${opts.mode}.pid`);
    const existingStackPid = readPidFile(stackPidFile);
    if (existingStackPid) {
      appendMeta(
        logs.metaPath,
        `prod redeploy: stopping existing stack pid=${existingStackPid}`,
      );
      await killTree(existingStackPid, treeKill);
      clearPid(opts.logDir, opts.mode);
    }
  }

  const { child, pidFile } = spawnNpmRun(
    opts,
    { outFd: logs.outFd, errFd: logs.errFd, metaPath: logs.metaPath },
    treeKill,
  );

  if (opts.foreground) {
    await new Promise((resolve) => {
      child.on('exit', resolve);
    });
    return;
  }

  console.log(`[vps-serve] started bun run ${opts.mode} (pid=${child.pid})`);
  console.log(`[vps-serve] pid file: ${pidFile}`);
  console.log(`[vps-serve] logs: ${logs.outPath} / ${logs.errPath}`);
  console.log(`[vps-serve] launcher detached; you can close this terminal.`);

  process.exit(0);
}

main().catch((e) => {
  console.error('[vps-serve] fatal:', e);
  process.exit(1);
});
