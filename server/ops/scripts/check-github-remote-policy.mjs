#!/usr/bin/env bun
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
const mirror = fs.readFileSync(
  path.join(root, 'server/ops/scripts/mirror-release-to-github.sh'),
  'utf8',
);

const requiredInGuard = [
  'refs/heads/main',
  'refs/heads/master',
  'origin/main',
  'check_branch_upstream_policy',
  'GitHub is the public mirror for main only',
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

if (!prePush.includes('check-echo-version-bump.mjs')) {
  console.error(
    'check-github-remote-policy: pre-push must run check-echo-version-bump.mjs',
  );
  process.exit(1);
}

if (!prePush.includes('ECHO_SKIP_VERSION_GATE')) {
  console.error(
    'check-github-remote-policy: pre-push must honor ECHO_SKIP_VERSION_GATE',
  );
  process.exit(1);
}

const bump = fs.readFileSync(
  path.join(root, 'server/ops/scripts/bump-echo-version.mjs'),
  'utf8',
);
const versionLib = fs.readFileSync(
  path.join(root, 'server/ops/scripts/echo-version.mjs'),
  'utf8',
);
const checkVersion = fs.readFileSync(
  path.join(root, 'server/ops/scripts/check-echo-version-bump.mjs'),
  'utf8',
);
for (const [label, hay, needle] of [
  ['bump-echo-version.mjs', bump, '--attest'],
  ['bump-echo-version.mjs', bump, '--summary'],
  ['bump-echo-version.mjs', bump, '--why'],
  ['bump-echo-version.mjs', bump, 'formatReleaseCommitMessage'],
  ['echo-version.mjs', versionLib, 'validateBumpAttestation'],
  ['echo-version.mjs', versionLib, 'Echo-Version-Attest'],
  ['check-echo-version-bump.mjs', checkVersion, 'validateReleaseCommitForBump'],
]) {
  if (!hay.includes(needle)) {
    console.error(
      `check-github-remote-policy: ${label} must keep attested version bumps (${needle})`,
    );
    process.exit(1);
  }
}

if (!mirror.includes('GITHUB_BRANCH="${GITHUB_BRANCH:-main}"')) {
  console.error(
    'check-github-remote-policy: mirror-release-to-github.sh must default GITHUB_BRANCH to main',
  );
  process.exit(1);
}

console.log('check-github-remote-policy: ok');
