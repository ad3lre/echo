#!/usr/bin/env node
/**
 * Snapshot post-cutoff metrics for files that do not yet meet strict thresholds.
 * Enrolled files are ratcheted: CI fails when lines, function length, or nesting
 * grow beyond the snapshot.
 *
 *   node scripts/generate-new-code-charter-enrollment.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeFile,
  isTestPath,
  loadConfig,
  loadGrandfatherPaths,
} from './check-new-code-charter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const outPath = path.join(__dirname, 'new-code-charter-enrollment.json');

const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.js', '.jsx']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'tests', '__tests__']);

function walkDir(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkDir(full, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function relPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function needsEnrollment(metrics, config) {
  const { strict } = config;
  return (
    metrics.lines > strict.maxFileLines ||
    metrics.longestFunction > strict.maxFunctionLines ||
    metrics.deepNestingLines > strict.maxDeepNestingLines
  );
}

function main() {
  const config = loadConfig();
  const grandfather = loadGrandfatherPaths();
  const files = {};

  for (const scope of config.scopes) {
    for (const absPath of walkDir(path.join(repoRoot, scope))) {
      const rel = relPosix(absPath);
      if (isTestPath(rel) || grandfather.has(rel)) continue;

      const content = fs.readFileSync(absPath, 'utf8');
      const { metrics } = analyzeFile(rel, content, config);
      if (!needsEnrollment(metrics, config)) continue;

      files[rel] = {
        lines: metrics.lines,
        longestFunction: metrics.longestFunction,
        deepNestingLines: metrics.deepNestingLines,
        maxNestingSpaces: metrics.maxNestingSpaces,
      };
    }
  }

  const payload = {
    enrolledAt: new Date().toISOString().slice(0, 10),
    strict: config.strict,
    files,
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (!process.argv.includes('--write')) {
    process.stdout.write(json);
    console.error(
      `generate-new-code-charter-enrollment: ${Object.keys(files).length} file(s) (dry run; pass --write)`,
    );
    process.exit(0);
  }

  fs.writeFileSync(outPath, json);
  console.log(
    `generate-new-code-charter-enrollment: wrote ${Object.keys(files).length} file(s) to ${path.relative(repoRoot, outPath)}`,
  );
}

main();
