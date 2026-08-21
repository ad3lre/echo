#!/usr/bin/env node
/**
 * Regenerate server/ops/scripts/new-code-charter-grandfather.json from the cutoff commit in
 * server/ops/scripts/new-code-charter-config.json.
 *
 *   node server/ops/scripts/generate-new-code-charter-grandfather.mjs --write
 *
 * After rewriting the path list, snapshot size ceilings with:
 *   node server/ops/scripts/generate-new-code-charter-grandfather-baselines.mjs --write
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestPath } from './check-new-code-charter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const configPath = path.join(__dirname, 'new-code-charter-config.json');
const outPath = path.join(__dirname, 'new-code-charter-grandfather.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const cutoffCommit = config.cutoffCommit;

if (!cutoffCommit) {
  console.error('generate-new-code-charter-grandfather: missing cutoffCommit');
  process.exit(1);
}

const scopeArgs = config.scopes.map((s) => `'${s}/**'`).join(' ');
const raw = execSync(
  `git ls-tree -r --name-only ${cutoffCommit} -- ${config.scopes.join(' ')}`,
  { cwd: repoRoot, encoding: 'utf8' },
);

const paths = raw
  .split(/\r?\n/)
  .map((p) => p.trim())
  .filter(Boolean)
  .filter((p) => /\.(ts|tsx|vue|js|jsx)$/.test(p))
  .filter((p) => !isTestPath(p))
  .sort();

const payload = {
  cutoffIso: config.cutoffIso,
  cutoffCommit,
  generatedAt: new Date().toISOString(),
  paths,
};

const json = `${JSON.stringify(payload, null, 2)}\n`;

if (!process.argv.includes('--write')) {
  process.stdout.write(json);
  console.error(
    `generate-new-code-charter-grandfather: ${paths.length} path(s) (dry run; pass --write)`,
  );
  process.exit(0);
}

fs.writeFileSync(outPath, json);
console.log(
  `generate-new-code-charter-grandfather: wrote ${paths.length} path(s) to ${path.relative(repoRoot, outPath)}`,
);
