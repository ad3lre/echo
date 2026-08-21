#!/usr/bin/env node
/**
 * Start backend + frontend preview on staging ports without touching :3000 / :4173.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIntegerInRange } from './lib/number-parse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function parsePorts(argv) {
  let apiPort = parseIntegerInRange(
    process.env.ECHO_STAGING_API_PORT,
    3001,
    1,
    65_535,
  );
  let frontendPort = parseIntegerInRange(
    process.env.ECHO_STAGING_FRONTEND_PORT,
    4175,
    1,
    65_535,
  );
  for (const a of argv) {
    if (a.startsWith('--api-port='))
      apiPort = parseIntegerInRange(
        a.slice('--api-port='.length),
        3001,
        1,
        65_535,
      );
    if (a.startsWith('--frontend-port='))
      frontendPort = parseIntegerInRange(
        a.slice('--frontend-port='.length),
        4175,
        1,
        65_535,
      );
  }
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
const frontendCmd = `node server/ops/scripts/wait-for-port.mjs 127.0.0.1 ${apiPort} && cross-env NODE_ENV=production npm run preview -w web -- --host --port ${frontendPort} --strictPort`;

const child = spawn(
  process.execPath,
  [path.join(repoRoot, 'server/ops/scripts/kill-dev-ports.mjs')],
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
