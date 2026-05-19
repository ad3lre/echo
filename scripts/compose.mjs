/**
 * Runs `docker compose` with repo-root `.env` and optional `.env.lan` (same order as Docker:
 * later file overrides earlier for duplicate keys).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const composeArgs = ['compose'];
const envMain = path.join(root, '.env');
const envLan = path.join(root, '.env.lan');
if (fs.existsSync(envMain)) {
  composeArgs.push('--env-file', envMain);
}
if (fs.existsSync(envLan)) {
  composeArgs.push('--env-file', envLan);
}
composeArgs.push(...process.argv.slice(2));

const r = spawnSync('docker', composeArgs, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
