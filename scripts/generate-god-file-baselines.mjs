#!/usr/bin/env node
/**
 * Regenerate scripts/god-file-baselines.json from current tree (>= GOD_FILE_THRESHOLD lines).
 * Use after intentional refactors that shrink god files, or to snapshot before a baseline bump PR.
 *
 *   node scripts/generate-god-file-baselines.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOD_FILE_THRESHOLD } from './check-god-file-ratchet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const outPath = path.join(__dirname, 'god-file-baselines.json');

const SCAN_ROOTS = [
  path.join(repoRoot, 'frontend', 'src'),
  path.join(repoRoot, 'backend', 'src'),
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.js', '.jsx']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'tests']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walk(full, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function countLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
}

const baselines = {};
for (const root of SCAN_ROOTS) {
  for (const abs of walk(root)) {
    const lines = countLines(abs);
    if (lines < GOD_FILE_THRESHOLD) continue;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    baselines[rel] = lines;
  }
}

const sorted = Object.fromEntries(
  Object.entries(baselines).sort(([a], [b]) => a.localeCompare(b)),
);
const json = `${JSON.stringify(sorted, null, 2)}\n`;

if (!process.argv.includes('--write')) {
  process.stdout.write(json);
  console.error(
    `\nDry run: ${Object.keys(sorted).length} god file(s). Pass --write to update ${path.relative(repoRoot, outPath)}.`,
  );
  process.exit(0);
}

fs.writeFileSync(outPath, json);
console.log(
  `Wrote ${Object.keys(sorted).length} baseline(s) to ${path.relative(repoRoot, outPath)}`,
);
