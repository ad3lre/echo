#!/usr/bin/env bun
/**
 * Gate helper: ensure VERSION advanced by exactly one step (patch|minor|major).
 *
 * Usage:
 *   bun server/ops/scripts/check-echo-version-bump.mjs <old> <new>
 *   bun server/ops/scripts/check-echo-version-bump.mjs --from-git <remote_sha> <local_sha>
 *
 * Exit 0 on success; non-zero with a message pointing at version:bump.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyExactBump,
  formatVersion,
  parseVersion,
} from './echo-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const zero = '0000000000000000000000000000000000000000';

const args = process.argv.slice(2);

function fail(msg) {
  console.error(`check-echo-version-bump: ${msg}`);
  console.error('  Fix: bun run version:bump -- patch   # or minor / major');
  console.error('  Then: git push --follow-tags origin main');
  console.error('  Break-glass: ECHO_SKIP_VERSION_GATE=1 git push …');
  process.exit(1);
}

function gitShowVersion(sha) {
  if (!sha || sha === zero) {
    return '0.0.0';
  }
  const r = spawnSync('git', ['show', `${sha}:VERSION`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    // First introduction of VERSION: treat missing as 0.0.0
    return '0.0.0';
  }
  return (r.stdout || '').trim() || '0.0.0';
}

function requireTag(newVersion, remoteSha, localSha) {
  const tag = `v${newVersion}`;
  const tagRef = spawnSync(
    'git',
    ['rev-parse', '-q', '--verify', `${tag}^{}`],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  if (tagRef.status !== 0) {
    fail(`missing annotated tag ${tag} for VERSION ${newVersion}`);
  }
  const tagSha = (tagRef.stdout || '').trim();

  const ancestorLocal = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', tagSha, localSha],
    { cwd: root },
  );
  if (ancestorLocal.status !== 0) {
    fail(`tag ${tag} (${tagSha.slice(0, 7)}) is not reachable from push tip`);
  }

  if (remoteSha && remoteSha !== zero) {
    const ancestorRemote = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', tagSha, remoteSha],
      { cwd: root },
    );
    if (ancestorRemote.status === 0) {
      fail(
        `tag ${tag} is already on the remote tip — VERSION must move with a new tag in this push`,
      );
    }
  }
}

let oldRaw;
let newRaw;
let remoteSha = null;
let localSha = null;

if (args[0] === '--from-git') {
  remoteSha = args[1];
  localSha = args[2];
  if (!remoteSha || !localSha) {
    fail(
      'usage: check-echo-version-bump.mjs --from-git <remote_sha> <local_sha>',
    );
  }
  oldRaw = gitShowVersion(remoteSha);
  newRaw = gitShowVersion(localSha);
} else {
  oldRaw = args[0];
  newRaw = args[1];
  if (oldRaw == null || newRaw == null) {
    fail('usage: check-echo-version-bump.mjs <old> <new>');
  }
}

const result = classifyExactBump(oldRaw, newRaw);
if (!result.ok) {
  fail(result.reason);
}

// Validate parseability of new (already done) and optional tag when from-git
if (localSha) {
  const newStr = formatVersion(parseVersion(newRaw));
  requireTag(newStr, remoteSha, localSha);
}

console.log(
  `check-echo-version-bump: ok ${String(oldRaw).trim()} → ${String(newRaw).trim()} (${result.level})`,
);
