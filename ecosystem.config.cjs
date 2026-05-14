const path = require('path');
const fs = require('fs');

/**
 * PM2 app definitions. Install PM2 once: `npm install -g pm2` (use Node from `.nvmrc`, >=22.13).
 * Marketing only: `npm run marketing:pm2` from repo root.
 * Prefer NVM’s newest v22.x so PM2 does not pick an IDE-bundled Node (Astro 6 + ESLint 10).
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
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
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
      name: 'echo-watchdog',
      script: 'scripts/watchdog.mjs',
      env: {
        WATCHDOG_PORT: 80, // Set to 80 for public access, or 3005 for testing
        TARGET_PORT: 4173, // Default route points to chat-echo.com / echo-frontend
        TARGET_HOST: '127.0.0.1',
        WATCHDOG_HOST_TARGETS:
          'chat-echo.com=127.0.0.1:4173,www.chat-echo.com=127.0.0.1:4173,app-echo.net=127.0.0.1:4174,www.app-echo.net=127.0.0.1:4174',
      },
      restart_delay: 1000,
    },
  ],
};
