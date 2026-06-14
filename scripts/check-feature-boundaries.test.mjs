import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectCrossFeatureViolations,
  evaluateFeatureBoundaries,
} from './check-feature-boundaries.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadAllowlist() {
  return JSON.parse(
    readFileSync(
      path.join(repoRoot, 'scripts/feature-boundaries-allowlist.json'),
      'utf8',
    ),
  );
}

test('every current cross-feature crossing is grandfathered (no new violations)', () => {
  const { newViolations } = evaluateFeatureBoundaries();
  assert.equal(
    newViolations.length,
    0,
    newViolations.map((v) => `${v.file} -> ${v.spec}`).join('\n') ||
      'unexpected new crossing',
  );
});

test('allowlist has no stale entries (shrink-only invariant holds)', () => {
  const { staleEntries } = evaluateFeatureBoundaries();
  assert.equal(
    staleEntries.length,
    0,
    staleEntries.map((e) => `${e.file} -> ${e.spec}`).join('\n') ||
      'stale entry present',
  );
});

test('allowlist entry count matches the detected crossings', () => {
  const allowlist = loadAllowlist();
  const allowTotal = Object.values(allowlist.crossings).reduce(
    (n, specs) => n + specs.length,
    0,
  );
  const detected = collectCrossFeatureViolations().length;
  assert.equal(allowTotal, detected);
});

test('the composer feature (layout) is exempt as an importer', () => {
  const fromLayout = collectCrossFeatureViolations().filter(
    (v) => v.fromFeature === 'layout',
  );
  assert.equal(fromLayout.length, 0);
});
