#!/usr/bin/env node
/**
 * Start backend + frontend preview on staging ports without touching :3000 / :4173.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parsePorts(argv) {
  let apiPort = Number(process.env.ECHO_STAGING_API_PORT || 3001);
  let frontendPort = Number(process.env.ECHO_STAGING_FRONTEND_PORT || 4174);
  for (const a of argv) {
    if (a.startsWith('--api-port='))
      apiPort = Number(a.slice('--api-port='.length));
    if (a.startsWith('--frontend-port='))
      frontendPort = Number(a.slice('--frontend-port='.length));
  }
  if (!Number.isFinite(apiPort) || apiPort <= 0) apiPort = 3001;
  if (!Number.isFinite(frontendPort) || frontendPort <= 0) frontendPort = 4174;
  return { apiPort, frontendPort };
}

const { apiPort, frontendPort } = parsePorts(process.argv.slice(2));
const freePorts = `${apiPort},${frontendPort},3005`;
const concurrentlyBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  'concurrently',
);

const backendCmd = `cross-env NODE_ENV=production PORT=${apiPort} npm start`;
const frontendCmd = `node scripts/wait-for-port.mjs 127.0.0.1 ${apiPort} && cross-env NODE_ENV=production npm exec --prefix frontend -- vite preview --host --port ${frontendPort} --strictPort`;

const child = spawn(
  process.execPath,
  [path.join(repoRoot, 'scripts/kill-dev-ports.mjs')],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ECHO_FREE_PORTS: freePorts },
  },
);

child.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const stack = spawn(
    concurrentlyBin,
    ['-c', 'auto', '-n', 'backend,frontend', backendCmd, frontendCmd],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
      env: process.env,
    },
  );
  stack.on('exit', (c, signal) => {
    process.exit(c ?? (signal ? 1 : 0));
  });
});
