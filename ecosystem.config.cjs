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
/** Watch Together VC uploads: local disk even when S3 is configured (see backend/src/config/storage.ts). */
const wtLocalUploadEnv = {
  ECHO_LOCAL_UPLOAD_DIR: path.join(repoRoot, 'backend/data/echo-local-uploads'),
};

/**
 * PM2 app definitions. Install PM2 once: `npm install -g pm2` (use Node from `.nvmrc`, >=22.13).
 * Start from repo root: `pm2 start ecosystem.config.cjs` so `env_file` loads DATABASE_URL, ECHO_S3_*, etc.
 * `echo-backend` uses ECHO_VIDEO_HLS_WORKER=standalone; `echo-video-hls-worker` must run alongside it (ffmpeg on PATH).
 * `echo-media-cdn` and `echo-game-server` require Caddy routes on media.* / games.* subdomains.
 */
function resolveNvmNode22Bin() {
  const home = process.env.HOME || '';
  const versionsDir = path.join(home, '.nvm/versions/node');
  if (!fs.existsSync(versionsDir)) return null;
  const versions = fs
    .readdirSync(versionsDir)
    .filter((v) => /^v22\./.test(v))
    .sort()
    .reverse();
  for (const v of versions) {
    const nodeBin = path.join(versionsDir, v, 'bin', 'node');
    if (fs.existsSync(nodeBin)) return nodeBin;
  }
  return null;
}

const node22Bin = resolveNvmNode22Bin();
const npmCliJs = node22Bin
  ? path.join(
      path.dirname(node22Bin),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    )
  : null;
const echoMarketing =
  node22Bin && npmCliJs && fs.existsSync(npmCliJs)
    ? {
        name: 'echo-marketing',
        script: npmCliJs,
        args: 'run preview',
        interpreter: node22Bin,
        cwd: './marketing',
        env: {
          NODE_ENV: 'production',
          // npm lifecycle runs `astro` via shell; ensure `node` is Node 22+, not an IDE shim.
          PATH: `${path.dirname(node22Bin)}:${process.env.PATH || ''}`,
        },
        restart_delay: 3000,
      }
    : {
        name: 'echo-marketing',
        script: 'npm',
        args: 'run preview',
        cwd: './marketing',
        env: { NODE_ENV: 'production' },
        restart_delay: 3000,
      };

module.exports = {
  apps: [
    {
      name: 'echo-backend',
      script: 'npm',
      args: 'start',
      cwd: './backend',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
        PORT: 3000,
        ECHO_VIDEO_HLS_WORKER: 'standalone',
        ...wtLocalUploadEnv,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'echo-video-hls-worker',
      script: 'npm',
      args: 'run worker:video-hls',
      cwd: './backend',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
        ...wtLocalUploadEnv,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'echo-frontend',
      script: 'npm',
      args: 'run preview',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
    },
    echoMarketing,
    {
      name: 'echo-media-cdn',
      script: 'npm',
      args: 'start',
      cwd: './media-cdn',
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'echo-game-server',
      script: 'npm',
      args: 'start',
      cwd: './game-server',
      env: {
        NODE_ENV: 'production',
        ...fileEnv,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'echo-discord-bot',
      script: path.join(repoRoot, 'bot/dist/index.js'),
      args: '--serve',
      ...(node22Bin ? { interpreter: node22Bin } : {}),
      cwd: repoRoot,
      env_file: pm2EnvFile,
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'echo-watchdog',
      script: 'scripts/watchdog.mjs',
      env: {
        // 3005 is reserved for the Discord bot internal API (ECHO_DISCORD_BOT_INTERNAL_PORT).
        WATCHDOG_PORT: 8095,
        TARGET_PORT: 4173, // Default route points to chat-echo.com / echo-frontend
        TARGET_HOST: '127.0.0.1',
        WATCHDOG_HOST_TARGETS:
          'chat-echo.com=127.0.0.1:4173,www.chat-echo.com=127.0.0.1:4173,app-echo.net=127.0.0.1:4174,www.app-echo.net=127.0.0.1:4174',
      },
      restart_delay: 1000,
    },
  ],
};
