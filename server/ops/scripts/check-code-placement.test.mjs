import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCodePlacement } from './check-code-placement.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function loadBaselines() {
  return JSON.parse(
    readFileSync(
      path.join(repoRoot, 'server/ops/scripts/code-placement-baselines.json'),
      'utf8',
    ),
  );
}

test('checkCodePlacement passes on the current components tree', () => {
  const baselines = loadBaselines();
  const result = checkCodePlacement();
  assert.equal(result.errors.length, 0, result.errors.join('\n'));
  assert.equal(result.scanned, baselines.componentsFileCount);
});

test('baselines match the allowlist snapshot', () => {
  const baselines = loadBaselines();
  const allowlist = JSON.parse(
    readFileSync(
      path.join(repoRoot, 'server/ops/scripts/code-placement-allowlist.json'),
      'utf8',
    ),
  );
  assert.equal(allowlist.legacyPaths.length, baselines.legacyAllowlistCount);
});

test('leftover dump baselines match config roots', () => {
  const baselines = loadBaselines();
  const cfg = JSON.parse(
    readFileSync(
      path.join(repoRoot, 'server/ops/scripts/code-placement-config.json'),
      'utf8',
    ),
  );
  const keys = Object.keys(baselines.leftoverDumpFileCounts).sort();
  assert.deepEqual(keys, [...cfg.leftoverDumpRoots].sort());
  const immediateKeys = Object.keys(
    baselines.leftoverDumpImmediateFileCounts,
  ).sort();
  assert.deepEqual(immediateKeys, [...cfg.leftoverDumpImmediateRoots].sort());
});
