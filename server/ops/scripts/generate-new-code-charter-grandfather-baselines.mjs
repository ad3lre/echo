#!/usr/bin/env node
/**
 * Snapshot current metrics for every existing grandfathered path.
 * Grandfathered files stay exempt from strict new-code rules (ban any, etc.),
 * but CI fails when lines, function length, or nesting grow past this ceiling.
 *
 *   node server/ops/scripts/generate-new-code-charter-grandfather-baselines.mjs --write
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
const repoRoot = path.join(__dirname, '../../..');
const outPath = path.join(
  __dirname,
  'new-code-charter-grandfather-baselines.json',
);

function relExists(rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

function main() {
  const config = loadConfig();
  const grandfather = [...loadGrandfatherPaths()].sort();
  const files = {};
  let missing = 0;

  for (const rel of grandfather) {
    if (isTestPath(rel) || !relExists(rel)) {
      missing += 1;
      continue;
    }

    const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    const { metrics } = analyzeFile(rel, content, config);
    files[rel] = {
      lines: metrics.lines,
      longestFunction: metrics.longestFunction,
      deepNestingLines: metrics.deepNestingLines,
      maxNestingSpaces: metrics.maxNestingSpaces,
    };
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    strict: config.strict,
    files,
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (!process.argv.includes('--write')) {
    process.stdout.write(json);
    console.error(
      `generate-new-code-charter-grandfather-baselines: ${Object.keys(files).length} file(s), ${missing} missing/test (dry run; pass --write)`,
    );
    process.exit(0);
  }

  fs.writeFileSync(outPath, json);
  console.log(
    `generate-new-code-charter-grandfather-baselines: wrote ${Object.keys(files).length} file(s) to ${path.relative(repoRoot, outPath)} (${missing} grandfather path(s) skipped as missing/test)`,
  );
}

main();
