#!/usr/bin/env node
/**
 * Prints recent commit subjects for Google Play "What's new" (manual paste).
 * Usage: node scripts/android-play-whatsnew.mjs [count=20]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const n = Math.min(
  500,
  Math.max(1, parseInt(process.argv[2] || '20', 10) || 20),
);

const r = spawnSync(
  'git',
  ['-c', 'core.quotepath=false', 'log', '-n', String(n), '--pretty=%s'],
  { cwd: root, encoding: 'utf8' },
);

if (r.status !== 0) {
  console.error(r.stderr || r.stdout || 'git log failed');
  process.exit(r.status ?? 1);
}

console.log(r.stdout.trimEnd());
