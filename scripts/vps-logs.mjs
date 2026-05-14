#!/usr/bin/env node
/**
 * Follow logs for a detached `npm run vps:*` stack (same paths as vps-serve.mjs).
 *
 * - With no mode: picks dev or prod if exactly one of them has a pid file (stack or git-watch).
 * - Opens a new terminal window when a GUI is available (Windows, macOS, common Linux DEs).
 * - On headless SSH (no DISPLAY), runs `tail -f` in the current terminal.
 *
 * Usage:
 *   npm run vps:logs
 *   npm run vps:logs -- dev
 *   npm run vps:logs -- prod --log-dir=/path/to/logs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function printHelp() {
  console.error(`
Usage: node scripts/vps-logs.mjs [dev|prod] [options]

Options:
  --log-dir=DIR   Same as vps-serve (default: <repo>/logs/vps)
  --foreground    Always follow in this terminal (no new window)

If mode is omitted, dev or prod is inferred from echo-vps-*.pid under --log-dir.
`);
}

function parseArgs(argv) {
  const out = {
    mode: null,
    logDir: path.join(repoRoot, 'logs', 'vps'),
    foreground: false,
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--foreground') out.foreground = true;
    else if (a.startsWith('--log-dir='))
      out.logDir = path.resolve(a.slice('--log-dir='.length));
    else if (!a.startsWith('-') && (a === 'dev' || a === 'prod')) out.mode = a;
  }
  return out;
}

function pidRunning(logDir, mode) {
  const stack = path.join(logDir, `echo-vps-${mode}.pid`);
  const watch = path.join(logDir, `echo-vps-${mode}.watch.pid`);
  return fs.existsSync(stack) || fs.existsSync(watch);
}

function detectMode(logDir) {
  const dev = pidRunning(logDir, 'dev');
  const prod = pidRunning(logDir, 'prod');
  if (dev && prod) {
    console.error(
      '[vps-logs] Both dev and prod have pid files; specify mode:\n  npm run vps:logs -- dev\n  npm run vps:logs -- prod',
    );
    process.exit(1);
  }
  if (dev) return 'dev';
  if (prod) return 'prod';
  return null;
}

function logFiles(logDir, mode) {
  const outPath = path.join(logDir, `${mode}.stdout.log`);
  const errPath = path.join(logDir, `${mode}.stderr.log`);
  const metaPath = path.join(logDir, `${mode}.launcher.log`);
  return [outPath, errPath, metaPath].filter((p) => fs.existsSync(p));
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function onPath(cmd) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH || '').split(sep);
  for (const d of dirs) {
    const full = path.join(
      d,
      cmd + (process.platform === 'win32' ? '.exe' : ''),
    );
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function openDetachedTail(files, mode) {
  const title = `Echo VPS ${mode}`;
  const tailBin = onPath('tail');

  if (process.platform === 'win32' && tailBin) {
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', title, tailBin, '-n', '120', '-f', ...files],
      {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.unref();
    return true;
  }

  if (process.platform === 'win32') {
    const primary = files[0];
    const ps = `Get-Content -LiteralPath '${primary.replace(/'/g, "''")}' -Tail 80 -Wait`;
    const child = spawn(
      'cmd.exe',
      [
        '/c',
        'start',
        title,
        'powershell.exe',
        '-NoExit',
        '-NoProfile',
        '-Command',
        ps,
      ],
      {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.unref();
    return true;
  }

  if (process.platform === 'darwin') {
    const inner = `exec tail -n 120 -f ${files.map(shQuote).join(' ')}`;
    const script = `tell application "Terminal" to do script ${JSON.stringify(inner)}`;
    const child = spawn('osascript', ['-e', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  }

  if (process.platform === 'linux' && process.env.DISPLAY) {
    const argsTail = ['-n', '120', '-f', ...files];
    const tries = [
      ['gnome-terminal', ['--', 'tail', ...argsTail]],
      ['konsole', ['-e', 'tail', '-n', '120', '-f', ...files]],
      ['xfce4-terminal', ['-x', 'tail', '-n', '120', '-f', ...files]],
      ['xterm', ['-e', `tail -n 120 -f ${files.map(shQuote).join(' ')}`]],
    ];
    for (const [bin, args] of tries) {
      const resolved = onPath(bin);
      if (!resolved) continue;
      const child = spawn(resolved, args, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      return true;
    }
  }

  return false;
}

function followForeground(files) {
  const tailBin = onPath('tail');
  if (!tailBin) {
    console.error(
      '[vps-logs] `tail` not found in PATH. Install coreutils or open log files manually:\n  ' +
        files.join('\n  '),
    );
    process.exit(1);
  }
  const r = spawn(tailBin, ['-n', '120', '-f', ...files], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  r.on('exit', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.logDir, { recursive: true });

  let mode = opts.mode;
  if (!mode) {
    mode = detectMode(opts.logDir);
    if (!mode) {
      const devN = logFiles(opts.logDir, 'dev').length;
      const prodN = logFiles(opts.logDir, 'prod').length;
      if (devN > 0 && prodN === 0) mode = 'dev';
      else if (prodN > 0 && devN === 0) mode = 'prod';
      else {
        console.error(
          `[vps-logs] Could not infer dev vs prod (no pid files and ambiguous logs under ${opts.logDir}).\n` +
            'Start the stack, or pass the mode:\n  npm run vps:logs -- dev',
        );
        process.exit(1);
      }
      console.log(
        `[vps-logs] following ${mode} (from log files; no active pid)`,
      );
    } else {
      console.log(`[vps-logs] following ${mode} (auto-detected)`);
    }
  }

  const files = logFiles(opts.logDir, mode);
  if (files.length === 0) {
    console.error(
      `[vps-logs] No log files yet under ${opts.logDir} for ${mode}.\n` +
        `Expected ${mode}.stdout.log (and friends) after the stack has started.`,
    );
    process.exit(1);
  }

  if (!opts.foreground && openDetachedTail(files, mode)) {
    console.log('[vps-logs] opened a new window; close it when done.');
    process.exit(0);
  }

  console.log('[vps-logs] following in this terminal (Ctrl+C to exit) …');
  followForeground(files);
}

main();
