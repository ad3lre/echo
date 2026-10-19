#!/usr/bin/env bun
/**
 * Gate helper: ensure VERSION advanced by exactly one attested step.
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
  collectVersionRiskPaths,
  formatVersion,
  parseVersion,
  validateReleaseCommitForBump,
} from './echo-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const zero = '0000000000000000000000000000000000000000';

const args = process.argv.slice(2);

function fail(msg) {
  console.error(`check-echo-version-bump: ${msg}`);
  console.error(
    '  Fix: bun run version:bump -- <patch|minor|major> --attest … --summary "…" --why "…"',
  );
  console.error('  Docs: docs/operations/versioning.md');
  console.error('  Then: git push --follow-tags origin main');
  console.error('  Break-glass: ECHO_SKIP_VERSION_GATE=1 git push …');
  process.exit(1);
}

function git(argv) {
  return spawnSync('git', argv, {
    cwd: root,
    encoding: 'utf8',
  });
}

function gitShowVersion(sha) {
  if (!sha || sha === zero) {
    return '0.0.0';
  }
  const r = git(['show', `${sha}:VERSION`]);
  if (r.status !== 0) {
    // First introduction of VERSION: treat missing as 0.0.0
    return '0.0.0';
  }
  return (r.stdout || '').trim() || '0.0.0';
}

/**
 * Newest commit in remote..local that touches VERSION.
 * @param {string} remoteSha
 * @param {string} localSha
 */
function findVersionBumpCommit(remoteSha, localSha) {
  const range =
    remoteSha && remoteSha !== zero ? `${remoteSha}..${localSha}` : localSha;
  const r = git(['log', '-1', '--format=%H', range, '--', 'VERSION']);
  if (r.status !== 0 || !(r.stdout || '').trim()) {
    return null;
  }
  return (r.stdout || '').trim();
}

/**
 * @param {string} remoteSha
 * @param {string} localSha
 */
function riskPathsInPush(remoteSha, localSha) {
  const range =
    remoteSha && remoteSha !== zero ? `${remoteSha}..${localSha}` : localSha;
  const r = git(['diff', '--name-only', range]);
  if (r.status !== 0) return [];
  const names = (r.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return collectVersionRiskPaths(names);
}

/**
 * @param {string} newVersion
 * @param {string | null} remoteSha
 * @param {string} localSha
 * @param {'patch' | 'minor' | 'major'} level
 */
function requireTagAndAttestation(newVersion, remoteSha, localSha, level) {
  const tag = `v${newVersion}`;
  const tagRef = git(['rev-parse', '-q', '--verify', `${tag}^{}`]);
  if (tagRef.status !== 0) {
    fail(`missing annotated tag ${tag} for VERSION ${newVersion}`);
  }
  const tagSha = (tagRef.stdout || '').trim();

  const ancestorLocal = git(['merge-base', '--is-ancestor', tagSha, localSha]);
  if (ancestorLocal.status !== 0) {
    fail(`tag ${tag} (${tagSha.slice(0, 7)}) is not reachable from push tip`);
  }

  if (remoteSha && remoteSha !== zero) {
    const ancestorRemote = git([
      'merge-base',
      '--is-ancestor',
      tagSha,
      remoteSha,
    ]);
    if (ancestorRemote.status === 0) {
      fail(
        `tag ${tag} is already on the remote tip — VERSION must move with a new tag in this push`,
      );
    }
  }

  const bumpCommit = findVersionBumpCommit(remoteSha || zero, localSha);
  if (!bumpCommit) {
    fail('could not find the commit that updated VERSION in this push');
  }

  const msgR = git(['log', '-1', '--format=%B', bumpCommit]);
  if (msgR.status !== 0) {
    fail(`could not read message for VERSION commit ${bumpCommit.slice(0, 7)}`);
  }
  const message = msgR.stdout || '';
  const riskPaths = riskPathsInPush(remoteSha || zero, localSha);
  const validated = validateReleaseCommitForBump({
    version: newVersion,
    level,
    message,
    riskPaths,
  });
  if (!validated.ok) {
    fail(
      `VERSION commit ${bumpCommit.slice(0, 7)} failed attestation: ${validated.reason}`,
    );
  }

  // Tag body should not be the old empty "Echo X.Y.Z" placeholder alone.
  const tagMsgR = git(['tag', '-l', '--format=%(contents)', tag]);
  const tagMsg = (tagMsgR.stdout || '').trim();
  if (!tagMsg || /^Echo \d+\.\d+\.\d+$/.test(tagMsg)) {
    fail(
      `annotated tag ${tag} must include the release summary / judgment (not only "Echo ${newVersion}")`,
    );
  }
  if (!/compatible|breaking|evolution/i.test(tagMsg)) {
    fail(
      `annotated tag ${tag} must record attest level (compatible|breaking|evolution)`,
    );
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

// Validate parseability of new (already done) and attestation when from-git
if (localSha) {
  const newStr = formatVersion(parseVersion(newRaw));
  requireTagAndAttestation(newStr, remoteSha, localSha, result.level);
}

console.log(
  `check-echo-version-bump: ok ${String(oldRaw).trim()} → ${String(newRaw).trim()} (${result.level})`,
);
