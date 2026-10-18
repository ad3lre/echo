#!/usr/bin/env bun
/**
 * Bump Echo product version (root VERSION + package.json), commit, and tag.
 *
 * Usage:
 *   bun run version:bump -- patch|minor|major
 *   bun run version:bump -- patch --no-commit   # write files only
 *
 * Scheme: docs/operations/versioning.md
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpVersion, formatVersion, parseVersion } from './echo-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const versionPath = path.join(root, 'VERSION');
const packagePath = path.join(root, 'package.json');

const args = process.argv.slice(2).filter((a) => a !== '--');
const noCommit = args.includes('--no-commit');
const levelArg = args.find((a) => !a.startsWith('-'));

function usage(exitCode = 1) {
  console.error(
    'Usage: bun run version:bump -- patch|minor|major [--no-commit]',
  );
  process.exit(exitCode);
}

if (!levelArg || !['patch', 'minor', 'major'].includes(levelArg)) {
  usage(1);
}

const level = /** @type {'patch' | 'minor' | 'major'} */ (levelArg);

function git(argv, opts = {}) {
  const r = spawnSync('git', argv, {
    cwd: root,
    encoding: 'utf8',
    ...opts,
  });
  if (r.status !== 0) {
    const msg =
      (r.stderr || r.stdout || '').trim() || `git ${argv.join(' ')} failed`;
    throw new Error(msg);
  }
  return (r.stdout || '').trim();
}

function readCurrentVersion() {
  if (!fs.existsSync(versionPath)) {
    return parseVersion('0.0.0');
  }
  return parseVersion(fs.readFileSync(versionPath, 'utf8'));
}

const current = readCurrentVersion();
const next = bumpVersion(current, level);
const nextStr = formatVersion(next);
const tag = `v${nextStr}`;

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = nextStr;

fs.writeFileSync(versionPath, `${nextStr}\n`, 'utf8');
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(`echo-version: ${formatVersion(current)} → ${nextStr} (${level})`);

if (noCommit) {
  console.log('echo-version: wrote VERSION + package.json (--no-commit)');
  process.exit(0);
}

const status = git(['status', '--porcelain', '--', 'VERSION', 'package.json']);
if (!status) {
  console.error('echo-version: nothing to commit (VERSION already at target?)');
  process.exit(1);
}

git(['add', '--', 'VERSION', 'package.json']);
git(['commit', '-m', `chore(version): ${nextStr}`]);

const existing = spawnSync(
  'git',
  ['rev-parse', '-q', '--verify', `refs/tags/${tag}`],
  {
    cwd: root,
    encoding: 'utf8',
  },
);
if (existing.status === 0) {
  console.error(
    `echo-version: tag ${tag} already exists — delete it or choose another bump`,
  );
  process.exit(1);
}

git(['tag', '-a', tag, '-m', `Echo ${nextStr}`]);

console.log(`echo-version: committed and tagged ${tag}`);
console.log('echo-version: push with: git push --follow-tags origin main');
