#!/usr/bin/env node
/**
 * CI guard: GitHub mirror policy hooks and docs must stay wired.
 * Prevents accidental removal of main-history leak protections.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');

const prePush = fs.readFileSync(
  path.join(root, 'server/ops/scripts/githooks/pre-push'),
  'utf8',
);
const guard = fs.readFileSync(
  path.join(root, 'server/ops/scripts/githooks/github-push-guard.sh'),
  'utf8',
);

const requiredInGuard = [
  'refs/heads/main',
  'refs/heads/master',
  'refs/heads/release/1.0.0',
  'origin/main',
  'check_branch_upstream_policy',
];

const missing = requiredInGuard.filter((s) => !guard.includes(s));
if (missing.length) {
  console.error(
    'check-github-remote-policy: github-push-guard.sh missing:',
    missing.join(', '),
  );
  process.exit(1);
}

if (!prePush.includes('github-push-guard.sh')) {
  console.error(
    'check-github-remote-policy: pre-push must source github-push-guard.sh',
  );
  process.exit(1);
}

if (!prePush.includes('check_branch_upstream_policy')) {
  console.error(
    'check-github-remote-policy: pre-push must call check_branch_upstream_policy',
  );
  process.exit(1);
}

console.log('check-github-remote-policy: ok');
