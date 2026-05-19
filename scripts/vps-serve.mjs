#!/usr/bin/env node
/**
 * VPS-oriented runner for `npm run dev` / `npm run prod`.
 *
 * Without --foreground: start the stack detached from the TTY, append logs under --log-dir,
 * write a PID file, then exit the launcher (survives SSH disconnect).
 *
 * --git-watch: keep the launcher running; poll git, and when origin moves, stop the stack,
 * `git pull --ff-only`, optionally `npm install`, and start again.
 *
 * --foreground: do not exit the launcher after starting (and for non-watch, wait on the child
 * with stdio inherited — useful for debugging).
 *
 * Env:
 *   VPS_GIT_POLL_MS - poll interval for --git-watch (default 60000)
 *   VPS_NPM_INSTALL_AFTER_PULL - set to "1" to run `npm install` after each successful pull
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
const repoRoot = path.resolve(__dirname, '..');

/**
 * When the shell's `node` is wrong (e.g. IDE-bundled Node 20), workspace scripts still need
 * the repo's `.nvmrc` Node (>=22.13 for Astro 6 + ESLint 10). Prepend ~/.nvm/.../bin to PATH if present.
 */
function nvmNodeBinDir() {
  try {
    const rcPath = path.join(repoRoot, '.nvmrc');
    if (!fs.existsSync(rcPath)) return '';
    const raw = fs.readFileSync(rcPath, 'utf8').trim().split(/\s+/)[0];
    if (!raw) return '';
    const base = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (!fs.existsSync(base)) return '';
    const want = raw.replace(/^v/, '');
    const dirs = fs.readdirSync(base).filter((d) => {
      if (!d.startsWith('v')) return false;
      const rest = d.slice(1);
      return (
        rest === want ||
        rest.startsWith(`${want}.`) ||
        (want.includes('.') && rest.startsWith(want))
      );
    });
    if (!dirs.length) return '';
    dirs.sort();
    const pick = dirs[dirs.length - 1];
    const bin = path.join(base, pick, 'bin');
    return fs.existsSync(path.join(bin, 'node')) ? bin : '';
  } catch {
    return '';
  }
}

function printHelp() {
  console.error(`
Usage: node scripts/vps-serve.mjs <dev|prod> [options]

Options:
  --git-watch       Poll origin and restart when new commits appear (launcher stays running)
  --daemon          With --git-watch: detach the launcher itself and exit (survives SSH disconnect)
  --foreground      Do not detach: stay attached (non-watch: wait with inherited stdio)
  --stop            Stop the running stack / watcher (uses pid files under --log-dir)
  --watch-branch=B  With --git-watch: watch/pull this branch (default: current branch; error if detached HEAD)
  --log-dir=DIR     Log directory (default: <repo>/logs/vps)
  --poll-ms=N       Git poll interval in ms (default: 60000 or VPS_GIT_POLL_MS; min 5000)

Examples:
  npm run vps -- prod
  npm run vps -- dev --foreground
  npm run vps -- prod --git-watch
  npm run vps -- dev --git-watch --daemon
  npm run vps -- prod --git-watch --watch-branch=release/1.0.0
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

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
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

  /** Detach npm from the launcher TTY (daemon one-shot, or git-watch supervisor). */
  const detachChild = !foreground || gitWatch;

  appendMeta(
    logs.metaPath,
    `spawn npm run ${mode} (foreground=${foreground}, gitWatch=${gitWatch}, detachChild=${detachChild})`,
  );

  const stdio =
    foreground && !gitWatch ? 'inherit' : ['ignore', logs.outFd, logs.errFd];

  const nvmBin = nvmNodeBinDir();
  const env = { ...process.env, FORCE_COLOR: '0' };
  if (nvmBin) {
    env.PATH = `${nvmBin}${path.delimiter}${env.PATH}`;
    appendMeta(
      logs.metaPath,
      `PATH: prepended nvm node bin (${nvmBin}) so npm workspaces use .nvmrc Node`,
    );
  }

  const child = spawn(npmCmd(), ['run', mode], {
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
      `npm run ${mode} exit code=${code} signal=${signal ?? 'none'}`,
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
  if (process.env.VPS_NPM_INSTALL_AFTER_PULL !== '1') return;
  appendMeta(metaPath, 'running npm install (VPS_NPM_INSTALL_AFTER_PULL=1)');
  await execFileAsync(npmCmd(), ['install'], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
  });
}

/** Seconds every connected client sees before this launcher stops the stack (matches API default). */
const VPS_DEPLOY_COUNTDOWN_SECONDS = 6;

/**
 * Notify all browsers via the running API (`POST /api/v1/system/deploy-countdown`), then wait so
 * users see the in-app countdown before SIGTERM. Requires `VPS_DEPLOY_NOTIFY_ORIGIN` (public API
 * base, no trailing slash) and `ECHO_DEPLOY_NOTIFY_SECRET` (same value as the API’s env).
 */
async function notifyDeployCountdownAndWait(
  metaPath,
  seconds = VPS_DEPLOY_COUNTDOWN_SECONDS,
) {
  const origin = process.env.VPS_DEPLOY_NOTIFY_ORIGIN?.trim();
  const secret = process.env.ECHO_DEPLOY_NOTIFY_SECRET?.trim();
  if (!origin || !secret) {
    appendMeta(
      metaPath,
      'deploy countdown skipped — set VPS_DEPLOY_NOTIFY_ORIGIN and ECHO_DEPLOY_NOTIFY_SECRET on the launcher (secret must match API ECHO_DEPLOY_NOTIFY_SECRET)',
    );
    return;
  }
  const base = origin.replace(/\/$/, '');
  const url = `${base}/api/v1/system/deploy-countdown`;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Echo-Deploy-Notify-Secret': secret,
      },
      body: JSON.stringify({ seconds }),
      signal: ac.signal,
    });
    clearTimeout(to);
    const bodyText = await res.text().catch(() => '');
    if (!res.ok) {
      appendMeta(
        metaPath,
        `deploy countdown HTTP ${res.status}: ${bodyText.slice(0, 240)}`,
      );
    } else {
      appendMeta(
        metaPath,
        `deploy countdown broadcast to clients (${seconds}s)`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendMeta(metaPath, `deploy countdown request failed: ${msg}`);
  }
  appendMeta(metaPath, `waiting ${seconds}s before stopping stack…`);
  await new Promise((r) => setTimeout(r, seconds * 1000));
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
        `git: new commits (${status.branch}) — stopping stack, pulling, restarting`,
      );

      appendMeta(
        logs.metaPath,
        `git: restarting due to ${status.branch} update (local=${status.local}, remote=${status.remote})`,
      );

      await notifyDeployCountdownAndWait(logs.metaPath);
      await stopChild();
      await gitPullFfOnly(status.branch);
      await maybeNpmInstallAfterPull(logs.metaPath);
      appendMeta(logs.metaPath, 'git pull complete; restarting stack');
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
    appendMeta(
      logs.metaPath,
      'stop: notifying connected clients before stack shutdown',
    );
    await notifyDeployCountdownAndWait(logs.metaPath);
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

  const { child, pidFile, logs } = spawnNpmRun(opts, null, treeKill);

  if (opts.foreground) {
    await new Promise((resolve) => {
      child.on('exit', resolve);
    });
    return;
  }

  console.log(`[vps-serve] started npm run ${opts.mode} (pid=${child.pid})`);
  console.log(`[vps-serve] pid file: ${pidFile}`);
  console.log(`[vps-serve] logs: ${logs.outPath} / ${logs.errPath}`);
  console.log(`[vps-serve] launcher detached; you can close this terminal.`);

  process.exit(0);
}

main().catch((e) => {
  console.error('[vps-serve] fatal:', e);
  process.exit(1);
});
