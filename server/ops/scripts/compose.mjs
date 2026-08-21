/**
 * Runs `docker compose` with repo-root `.env` and optional `.env.lan` (same order as Docker:
 * later file overrides earlier for duplicate keys).
 *
 * Uses a stable Compose project name so clones/worktrees (e.g. echo vs echo-active on a VPS)
 * manage the same fixed-name containers (`echo-postgres`, …) instead of conflicting creates.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveComposeProjectName } from './lib/composeProjectName.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

const envMain = path.join(root, '.env');
const envLan = path.join(root, '.env.lan');

function loadEnvFile(filePath, into) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in into)) into[key] = value;
  }
}

const composeEnv = { ...process.env };
loadEnvFile(envMain, composeEnv);
loadEnvFile(envLan, composeEnv);

const composeArgs = ['compose', '-p', resolveComposeProjectName(composeEnv)];
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
  env: composeEnv,
});
process.exit(r.status === null ? 1 : r.status);
