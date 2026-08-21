#!/usr/bin/env node
/**
 * God-file ratchet: oversized source files may not grow without an explicit baseline bump.
 *
 * - Each path in server/ops/scripts/god-file-baselines.json has a frozen max line count (>= 700 at snapshot).
 * - CI fails when any baselined file exceeds its ceiling.
 * - New files crossing GOD_FILE_THRESHOLD must be added to the baseline file (review-visible bypass).
 *
 * Emergency local bypass: ECHO_GOD_FILE_RATCHET_BYPASS=1
 * Intentional growth bypass: raise the path's line count in server/ops/scripts/god-file-baselines.json
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');

/** Lines at or above this count qualify as a god file (must be baselined). */
export const GOD_FILE_THRESHOLD = 700;

const BASELINE_PATH = path.join(__dirname, 'god-file-baselines.json');

const SCAN_ROOTS = [
  path.join(repoRoot, 'clients', 'web', 'src'),
  path.join(repoRoot, 'server', 'backend', 'src'),
  path.join(repoRoot, 'server', 'backend', 'crypto', 'src'),
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.js', '.jsx']);

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'tests']);

function countLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
}

function walkSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkSourceFiles(full, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function loadBaselines() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `check-god-file-ratchet: missing ${path.relative(repoRoot, BASELINE_PATH)}`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.error('check-god-file-ratchet: baselines JSON must be an object');
    process.exit(1);
  }
  return raw;
}

function relPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function allSourceFiles() {
  return walkSourceFiles(SCAN_ROOTS[0]).concat(walkSourceFiles(SCAN_ROOTS[1]));
}

/**
 * @param {{ onlyPaths?: Set<string>, skipStaleCheck?: boolean }} [opts]
 */
export function checkGodFileRatchet(opts = {}) {
  const baselines = loadBaselines();
  const baselinePaths = new Set(Object.keys(baselines));

  const growthViolations = [];
  const newGodViolations = [];
  const staleBaselines = [];

  for (const absPath of allSourceFiles()) {
    const rel = relPosix(absPath);
    if (opts.onlyPaths && !opts.onlyPaths.has(rel)) continue;

    const lines = countLines(absPath);
    const ceiling = baselines[rel];

    if (typeof ceiling === 'number') {
      if (lines > ceiling) {
        growthViolations.push({ rel, ceiling, lines, delta: lines - ceiling });
      }
      continue;
    }

    if (lines >= GOD_FILE_THRESHOLD) {
      newGodViolations.push({ rel, lines });
    }
  }

  if (!opts.skipStaleCheck) {
    for (const rel of baselinePaths) {
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) staleBaselines.push(rel);
    }
  }

  return { growthViolations, newGodViolations, staleBaselines };
}

function printViolations(result) {
  const { growthViolations, newGodViolations, staleBaselines } = result;
  let failed = false;

  if (growthViolations.length) {
    failed = true;
    console.error(
      `\ncheck-god-file-ratchet: ${growthViolations.length} baselined god file(s) grew past their ceiling:`,
    );
    for (const v of growthViolations.sort((a, b) => b.delta - a.delta)) {
      console.error(`  +${v.delta} lines  ${v.lines} > ${v.ceiling}  ${v.rel}`);
    }
    console.error(
      '\nExtract logic into smaller modules, or intentionally raise the ceiling in server/ops/scripts/god-file-baselines.json.',
    );
  }

  if (newGodViolations.length) {
    failed = true;
    console.error(
      `\ncheck-god-file-ratchet: ${newGodViolations.length} new god file(s) (>= ${GOD_FILE_THRESHOLD} lines) without a baseline:`,
    );
    for (const v of newGodViolations.sort((a, b) => b.lines - a.lines)) {
      console.error(`  ${String(v.lines).padStart(5)}  ${v.rel}`);
    }
    console.error(
      `\nAdd entries to server/ops/scripts/god-file-baselines.json only when you deliberately accept a new oversized file.`,
    );
  }

  if (staleBaselines.length) {
    failed = true;
    console.error(
      `\ncheck-god-file-ratchet: ${staleBaselines.length} baseline path(s) no longer exist:`,
    );
    for (const rel of staleBaselines.sort()) {
      console.error(`  ${rel}`);
    }
    console.error(
      '\nRemove stale entries from server/ops/scripts/god-file-baselines.json.',
    );
  }

  return failed;
}

function stagedPaths() {
  let staged = '';
  try {
    staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
  const paths = staged
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paths.length ? new Set(paths) : null;
}

function main() {
  if (process.env.ECHO_GOD_FILE_RATCHET_BYPASS === '1') {
    console.warn(
      'check-god-file-ratchet: skipped (ECHO_GOD_FILE_RATCHET_BYPASS=1)',
    );
    process.exit(0);
  }

  const stagedOnly = process.argv.includes('--staged');
  let onlyPaths;
  if (stagedOnly) {
    onlyPaths = stagedPaths();
    if (!onlyPaths) process.exit(0);
  }

  const result = checkGodFileRatchet({
    onlyPaths,
    skipStaleCheck: Boolean(stagedOnly),
  });
  if (printViolations(result)) {
    console.error(
      '\nEmergency bypass (local only, do not rely on in CI): ECHO_GOD_FILE_RATCHET_BYPASS=1',
    );
    process.exit(1);
  }

  console.log('check-god-file-ratchet: ok');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
