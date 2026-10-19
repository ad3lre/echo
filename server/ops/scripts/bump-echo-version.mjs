#!/usr/bin/env bun
/**
 * Bump Echo product version (root VERSION + package.json), commit, and tag.
 *
 * Usage:
 *   bun run version:bump -- patch|minor|major \
 *     --attest compatible|breaking|evolution \
 *     --summary "what changed for operators" \
 *     --why "self-host upgrade judgment (why this attest level)" \
 *     [--risk-ok "why risk paths are still compatible"] \
 *     [--no-commit]
 *
 * Scheme: docs/operations/versioning.md
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTEST_TO_LEVEL,
  bumpVersion,
  collectVersionRiskPaths,
  formatReleaseCommitMessage,
  formatVersion,
  LEVEL_TO_ATTEST,
  parseVersion,
  validateBumpAttestation,
} from './echo-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const versionPath = path.join(root, 'VERSION');
const packagePath = path.join(root, 'package.json');

/**
 * @param {string[]} argv
 * @returns {{
 *   level: string | null,
 *   attest: string | null,
 *   summary: string | null,
 *   why: string | null,
 *   riskOk: string | null,
 *   noCommit: boolean,
 *   help: boolean,
 * }}
 */
function parseArgs(argv) {
  /** @type {string | null} */
  let level = null;
  /** @type {string | null} */
  let attest = null;
  /** @type {string | null} */
  let summary = null;
  /** @type {string | null} */
  let why = null;
  /** @type {string | null} */
  let riskOk = null;
  let noCommit = false;
  let help = false;

  const args = argv.filter((a) => a !== '--');
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      help = true;
      continue;
    }
    if (a === '--no-commit') {
      noCommit = true;
      continue;
    }
    if (a === '--attest') {
      attest = args[++i] ?? null;
      continue;
    }
    if (a.startsWith('--attest=')) {
      attest = a.slice('--attest='.length);
      continue;
    }
    if (a === '--summary') {
      summary = args[++i] ?? null;
      continue;
    }
    if (a.startsWith('--summary=')) {
      summary = a.slice('--summary='.length);
      continue;
    }
    if (a === '--why') {
      why = args[++i] ?? null;
      continue;
    }
    if (a.startsWith('--why=')) {
      why = a.slice('--why='.length);
      continue;
    }
    if (a === '--risk-ok') {
      riskOk = args[++i] ?? null;
      continue;
    }
    if (a.startsWith('--risk-ok=')) {
      riskOk = a.slice('--risk-ok='.length);
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`echo-version: unknown flag ${a}`);
      usage(1);
    }
    if (level) {
      console.error(`echo-version: unexpected argument ${a}`);
      usage(1);
    }
    level = a;
  }

  return { level, attest, summary, why, riskOk, noCommit, help };
}

function usage(exitCode = 1) {
  console.error(`Usage:
  bun run version:bump -- <patch|minor|major> \\
    --attest <compatible|breaking|evolution> \\
    --summary "<what changed>" \\
    --why "<self-host upgrade judgment>" \\
    [--risk-ok "<why risk paths are still compatible>"] \\
    [--no-commit]

Attest must match level:
  patch  ↔ compatible   (in-place upgrade safe for self-hosters)
  minor  ↔ breaking     (lost feature or upgrade-breaking behavior)
  major  ↔ evolution    (deliberate marketed evolution)

Do not default to patch because it is easy. Read docs/operations/versioning.md.`);
  process.exit(exitCode);
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.help) usage(0);

if (
  !parsed.level ||
  !['patch', 'minor', 'major'].includes(parsed.level) ||
  !parsed.attest ||
  !parsed.summary ||
  !parsed.why
) {
  usage(1);
}

const level = /** @type {'patch' | 'minor' | 'major'} */ (parsed.level);
const attest = /** @type {'compatible' | 'breaking' | 'evolution'} */ (
  parsed.attest
);

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

function gitOk(argv) {
  const r = spawnSync('git', argv, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

function readCurrentVersion() {
  if (!fs.existsSync(versionPath)) {
    return parseVersion('0.0.0');
  }
  return parseVersion(fs.readFileSync(versionPath, 'utf8'));
}

/**
 * Range of commits that will be included in this bump (since previous version tag / VERSION).
 * @returns {{ base: string, riskPaths: string[], subjects: string[] }}
 */
function collectPushContext() {
  const head = gitOk(['rev-parse', 'HEAD']) || '';
  const prevTag = gitOk(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  let base = prevTag;
  if (!base) {
    // Fall back to last commit that touched VERSION, else empty tree.
    base =
      gitOk(['log', '-1', '--format=%H', '--', 'VERSION']) ||
      gitOk(['rev-list', '--max-parents=0', 'HEAD']) ||
      '';
  }

  const diffRange = base && head ? `${base}..${head}` : head ? head : '';
  const namesRaw = diffRange
    ? gitOk(['diff', '--name-only', diffRange])
    : gitOk(['diff', '--name-only', 'HEAD']);
  const riskPaths = collectVersionRiskPaths(
    namesRaw ? namesRaw.split('\n').filter(Boolean) : [],
  );

  const logRaw = diffRange
    ? gitOk(['log', '--format=%s', diffRange, '--no-merges'])
    : '';
  const subjects = (logRaw ? logRaw.split('\n') : [])
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^release:\s*\d+\.\d+\.\d+/i.test(s))
    .filter((s) => !/^chore\(version\):/i.test(s));

  return { base: base || '(none)', riskPaths, subjects };
}

const current = readCurrentVersion();
const next = bumpVersion(current, level);
const nextStr = formatVersion(next);
const tag = `v${nextStr}`;

const ctx = collectPushContext();
const judgment = validateBumpAttestation({
  level,
  attest,
  summary: parsed.summary,
  why: parsed.why,
  riskPaths: ctx.riskPaths,
  riskOk: parsed.riskOk || '',
});
if (!judgment.ok) {
  console.error(`echo-version: ${judgment.reason}`);
  if (ctx.riskPaths.length) {
    console.error('echo-version: risk paths in range since', ctx.base);
    for (const p of ctx.riskPaths.slice(0, 20)) {
      console.error(`  - ${p}`);
    }
  }
  console.error(
    `echo-version: hint — expected --attest ${LEVEL_TO_ATTEST[level]} for level ${level} (or change the level to match impact ${ATTEST_TO_LEVEL[attest] ?? '?'})`,
  );
  process.exit(1);
}

const releaseMessage = formatReleaseCommitMessage({
  version: nextStr,
  summary: parsed.summary,
  attest,
  why: parsed.why,
  riskOk: parsed.riskOk || '',
  includedSubjects: ctx.subjects,
});

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.version = nextStr;

fs.writeFileSync(versionPath, `${nextStr}\n`, 'utf8');
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(
  `echo-version: ${formatVersion(current)} → ${nextStr} (${level} / ${attest})`,
);
if (ctx.riskPaths.length) {
  console.log(
    `echo-version: ${ctx.riskPaths.length} self-host risk path(s) in range since ${ctx.base}`,
  );
}
if (ctx.subjects.length) {
  console.log(
    `echo-version: ${ctx.subjects.length} included change subject(s)`,
  );
}

if (parsed.noCommit) {
  console.log('echo-version: wrote VERSION + package.json (--no-commit)');
  console.log('echo-version: required commit message:\n');
  console.log(releaseMessage);
  process.exit(0);
}

const status = git(['status', '--porcelain', '--', 'VERSION', 'package.json']);
if (!status) {
  console.error('echo-version: nothing to commit (VERSION already at target?)');
  process.exit(1);
}

git(['add', '--', 'VERSION', 'package.json']);
git(['commit', '-m', releaseMessage]);

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

const tagBody = [
  `Echo ${nextStr} (${level} / ${attest})`,
  '',
  parsed.summary.trim().replace(/\s+/g, ' '),
  '',
  `Why: ${parsed.why.trim().replace(/\s+/g, ' ')}`,
  parsed.riskOk
    ? `Risk-Ok: ${parsed.riskOk.trim().replace(/\s+/g, ' ')}`
    : null,
  ctx.subjects.length ? '' : null,
  ctx.subjects.length ? 'Included changes:' : null,
  ...ctx.subjects.slice(0, 40).map((s) => `- ${s}`),
]
  .filter((line) => line !== null)
  .join('\n');

git(['tag', '-a', tag, '-m', tagBody]);

console.log(`echo-version: committed and tagged ${tag}`);
console.log('echo-version: push with: git push --follow-tags origin main');
