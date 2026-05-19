#!/usr/bin/env node
/**
 * Grab commit + file-touch data for conflictfiles-style analysis.
 *
 * Usage:
 *   node scripts/conflictfiles-git-snapshot.mjs
 *   node scripts/conflictfiles-git-snapshot.mjs -n 20
 *   node scripts/conflictfiles-git-snapshot.mjs --keywords fix,conflict,hotfix
 *   node scripts/conflictfiles-git-snapshot.mjs --json > snapshot.json
 *   node scripts/conflictfiles-git-snapshot.mjs --skip 10        # commits 11–20 from HEAD
 *
 * Writes to stdout or a path you pass; defaults are tuned for merge/conflict triage.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function git(args, { cwd = REPO_ROOT } = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function parseArgs(argv) {
  const out = {
    count: 10,
    skip: 0,
    keywords: ['fix', 'conflict'],
    json: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '-n' || a === '--count') {
      const v = argv[++i];
      const n = v ? Number.parseInt(v, 10) : NaN;
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid -n/--count: ${v ?? '(missing)'}`);
      }
      out.count = Math.floor(n);
    } else if (a === '--skip') {
      const v = argv[++i];
      const n = v ? Number.parseInt(v, 10) : NaN;
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid --skip: ${v ?? '(missing)'}`);
      }
      out.skip = Math.floor(n);
    } else if (a === '--keywords' || a === '-k') {
      const v = argv[++i];
      if (!v) throw new Error('--keywords requires a comma-separated list');
      out.keywords = v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!out.keywords.length)
        throw new Error('--keywords produced an empty list');
    } else {
      throw new Error(`Unknown argument: ${a} (try --help)`);
    }
  }
  return out;
}

function printHelp() {
  process.stdout
    .write(`conflictfiles-git-snapshot — dump recent commits + keyword-filtered file touches

Usage:
  node scripts/conflictfiles-git-snapshot.mjs [options]

Options:
  -n, --count <n>     Commits to scan from HEAD (default: 10)
      --skip <n>      Skip N newest commits first (e.g. --skip 10 → commits 11–20)
  -k, --keywords <s>  Comma-separated substrings to match in subject+body (default: fix,conflict)
      --json          Print one JSON object (for piping / tooling)
  -h, --help          Show this help

Examples:
  node scripts/conflictfiles-git-snapshot.mjs -n 15
  node scripts/conflictfiles-git-snapshot.mjs --skip 10
  node scripts/conflictfiles-git-snapshot.mjs --keywords regression,fix --json
`);
}

function parseRecentCommits(n, skip) {
  const rs = '\x1e';
  const us = '\x1f';
  const fmt = `%H${us}%ad${us}%s${us}%b${rs}`;
  const args = ['log', `-${n}`, '--date=short', `--pretty=format:${fmt}`];
  if (skip > 0) args.push(`--skip=${skip}`);
  const raw = git(args);
  if (!raw) return [];
  const records = raw.split(rs).filter((r) => r.trim().length > 0);
  const commits = records.map((rec) => {
    const parts = rec.split(us);
    const hash = (parts[0] ?? '').trim();
    const date = (parts[1] ?? '').trim();
    const subject = (parts[2] ?? '').trim();
    const body = parts.slice(3).join(us).trimEnd();
    return { hash, shortHash: hash.slice(0, 7), date, subject, body };
  });
  return commits.filter((c) => c.hash.length > 0);
}

function messageMatches(fullText, keywords) {
  const lower = fullText.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function listFilesForCommit(hash) {
  const out = git(['show', '--name-only', '--pretty=format:', hash]);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function aggregateFileCounts(filteredCommits) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of filteredCommits) {
    for (const f of c.files) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([file, count]) => ({ file, count }));
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
  if (opts.help) {
    printHelp();
    return;
  }

  const window = parseRecentCommits(opts.count, opts.skip);
  const filtered = [];

  for (const c of window) {
    const fullMessage = `${c.subject}\n${c.body}`.trim();
    const matched = messageMatches(fullMessage, opts.keywords);
    const files = matched ? listFilesForCommit(c.hash) : [];
    filtered.push({
      ...c,
      matchedKeywords: matched,
      files,
    });
  }

  const matchedCommits = filtered.filter((c) => c.matchedKeywords);
  const fileCounts = aggregateFileCounts(matchedCommits);

  const payload = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    options: {
      count: opts.count,
      skip: opts.skip,
      keywords: opts.keywords,
    },
    windowCommits: window.map(({ hash, shortHash, date, subject, body }) => ({
      hash,
      shortHash,
      date,
      subject,
      body,
    })),
    matchedCommits: matchedCommits.map(
      ({ hash, shortHash, date, subject, body, files }) => ({
        hash,
        shortHash,
        date,
        subject,
        body,
        files,
      }),
    ),
    fileCounts,
    summary: {
      windowSize: window.length,
      matchedCount: matchedCommits.length,
      uniqueFilesTouched: fileCounts.length,
    },
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const kw = opts.keywords.join(', ');
  const range =
    opts.skip > 0
      ? `${opts.count} commits after skipping ${opts.skip} (≈ commits ${opts.skip + 1}–${opts.skip + opts.count} from HEAD)`
      : `${opts.count} commits from HEAD`;
  process.stdout.write(`conflictfiles snapshot (${range}, keywords: ${kw})\n`);
  process.stdout.write(
    `matched ${payload.summary.matchedCount}/${payload.summary.windowSize} commits, ${payload.summary.uniqueFilesTouched} unique paths\n\n`,
  );

  process.stdout.write('--- Window (newest first) ---\n');
  for (const c of window) {
    process.stdout.write(`${c.shortHash} | ${c.date} | ${c.subject}\n`);
  }

  process.stdout.write('\n--- Matched commits ---\n');
  if (!matchedCommits.length) {
    process.stdout.write('(none)\n');
  } else {
    for (const c of matchedCommits) {
      process.stdout.write(`${c.shortHash} | ${c.date} | ${c.subject}\n`);
    }
  }

  process.stdout.write(
    '\n--- File touch counts (among matched commits only) ---\n',
  );
  if (!fileCounts.length) {
    process.stdout.write('(none)\n');
  } else {
    for (const { file, count } of fileCounts) {
      process.stdout.write(`${count}\t${file}\n`);
    }
  }

  process.stdout.write('\n--- Per matched commit: files ---\n');
  for (const c of matchedCommits) {
    process.stdout.write(`\n${c.shortHash} ${c.subject}\n`);
    for (const f of c.files) {
      process.stdout.write(`  ${f}\n`);
    }
  }

  process.stdout.write('\n(JSON: add --json for machine-readable output.)\n');
}

main();
