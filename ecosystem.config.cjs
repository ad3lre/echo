const path = require('path');
const fs = require('fs');

const repoRoot = __dirname;
const pm2EnvFile = path.join(repoRoot, '.env');
/** Parsed root `.env` for PM2 children (`env_file` is unreliable on some PM2 builds). */
function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}
const fileEnv = parseEnvFile(pm2EnvFile);
/** Watch Together VC uploads: local disk even when S3 is configured (see server/backend/src/config/storage.ts). */
const wtLocalUploadEnv = {
  ECHO_LOCAL_UPLOAD_DIR: path.join(
    repoRoot,
    'server/backend/data/echo-local-uploads',
  ),
};

/**
 * PM2 app definitions. Install PM2 once (`bun add -g pm2` or similar); apps run under Bun.
 * Start from repo root: `pm2 start ecosystem.config.cjs` so `env_file` loads DATABASE_URL, ECHO_S3_*, etc.
 * `echo-backend` uses ECHO_VIDEO_HLS_WORKER=standalone; `echo-video-hls-worker` must run alongside it (ffmpeg on PATH).
 * `echo-media` and `echo-activities` require Caddy routes on media.* / games.* subdomains.
 */
function resolveBunBin() {
  const home = process.env.HOME || '';
  const candidates = [
    process.env.BUN_INSTALL
      ? path.join(process.env.BUN_INSTALL, 'bin', 'bun')
      : '',
    path.join(home, '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/usr/bin/bun',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const { execSync } = require('child_process');
    const which = execSync('command -v bun', { encoding: 'utf8' }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {
    /* ignore */
  }
  return null;
}

const bunBin = resolveBunBin();
const bunPathPrefix = bunBin ? `${path.dirname(bunBin)}:` : '';

function bunApp(opts) {
  const base = {
    interpreter: bunBin || 'bun',
    env: {
      ...(opts.env || {}),
      PATH: `${bunPathPrefix}${process.env.PATH || ''}`,
    },
    restart_delay: opts.restart_delay ?? 3000,
  };
  if (opts.max_restarts != null) base.max_restarts = opts.max_restarts;
  if (opts.env_file) base.env_file = opts.env_file;
  return {
    name: opts.name,
    script: opts.script,
    args: opts.args,
    cwd: opts.cwd,
    ...base,
  };
}

/** Run `bun <args…>` directly — avoids PM2 Bun fork wrapper issues with CLIs / ESM. */
function bunCli(opts) {
  const base = {
    script: bunBin || 'bun',
    interpreter: 'none',
    args: opts.args,
    cwd: opts.cwd,
    env: {
      ...(opts.env || {}),
      PATH: `${bunPathPrefix}${process.env.PATH || ''}`,
    },
    restart_delay: opts.restart_delay ?? 3000,
  };
  if (opts.max_restarts != null) base.max_restarts = opts.max_restarts;
  if (opts.env_file) base.env_file = opts.env_file;
  return {
    name: opts.name,
    ...base,
  };
}

module.exports = {
  apps: [
    bunApp({
      name: 'echo-backend',
      script: 'dist/server/backend/src/index.js',
      cwd: './server/backend',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
        PORT: 3000,
        ECHO_VIDEO_HLS_WORKER: 'standalone',
        ...wtLocalUploadEnv,
      },
      max_restarts: 10,
    }),
    bunApp({
      name: 'echo-video-hls-worker',
      script: '../backend/dist/server/media/src/hls/worker.js',
      cwd: './server/media',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
        ...wtLocalUploadEnv,
      },
      max_restarts: 10,
    }),
    bunCli({
      name: 'echo-web',
      args: 'x vite preview --host --port 4173 --strictPort',
      cwd: './clients/web',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
    }),
    bunCli({
      name: 'echo-marketing',
      args: 'x astro preview --host --port 4174',
      cwd: './marketing',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
    }),
    bunApp({
      name: 'echo-media',
      script: 'dist/server/media/src/index.js',
      cwd: './server/media',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      max_restarts: 10,
    }),
    bunApp({
      name: 'echo-activities',
      script: 'dist/server/activities/src/index.js',
      cwd: './server/activities',
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      max_restarts: 10,
    }),
    bunCli({
      name: 'echo-discord-bot',
      args: 'bot/dist/index.js --serve',
      cwd: repoRoot,
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      max_restarts: 10,
    }),
    {
      name: 'echo-watchdog',
      script: 'server/ops/scripts/watchdog.mjs',
      interpreter: bunBin || 'bun',
      env: {
        WATCHDOG_PORT: 8095,
        TARGET_PORT: 4173,
        TARGET_HOST: '127.0.0.1',
        WATCHDOG_HOST_TARGETS:
          'chat-echo.com=127.0.0.1:4173,www.chat-echo.com=127.0.0.1:4173,app-echo.net=127.0.0.1:4174,www.app-echo.net=127.0.0.1:4174',
        PATH: `${bunPathPrefix}${process.env.PATH || ''}`,
      },
      restart_delay: 1000,
    },
  ],
};
