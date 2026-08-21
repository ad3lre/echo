#!/usr/bin/env node
/**
 * Generate scripts/feature-boundaries-allowlist.json from the cross-feature
 * internal imports that exist today (grandfather). The allowlist is shrink-only;
 * regenerate it ONLY to add a deliberately-accepted new crossing — normally you
 * shrink it by hand (delete an entry) after removing the import.
 *
 *   node server/ops/scripts/generate-feature-boundaries-allowlist.mjs          # preview counts
 *   node server/ops/scripts/generate-feature-boundaries-allowlist.mjs --write  # write the file
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCrossFeatureViolations } from './check-feature-boundaries.mjs';

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const OUT = path.join(
  repoRoot,
  'server',
  'ops',
  'scripts',
  'feature-boundaries-allowlist.json',
);

const violations = collectCrossFeatureViolations();
const crossings = {};
for (const v of violations.sort(
  (a, b) => a.file.localeCompare(b.file) || a.spec.localeCompare(b.spec),
)) {
  (crossings[v.file] ||= []).push(v.spec);
}
for (const k of Object.keys(crossings))
  crossings[k] = [...new Set(crossings[k])];

const out = {
  _comment:
    'Grandfathered cross-feature INTERNAL imports for check-feature-boundaries.mjs. SHRINK-ONLY: when you remove a crossing (route it through the feature public surface, a shared util, or the composer), delete its entry — a stale entry fails the build. See docs/overview/code-placement.md.',
  crossings,
};

const total = Object.values(crossings).reduce((n, s) => n + s.length, 0);
const json = `${JSON.stringify(out, null, 2)}\n`;

if (process.argv.includes('--write')) {
  writeFileSync(OUT, json);
  console.log(
    `Wrote ${path.relative(repoRoot, OUT)}: ${total} crossing(s) across ${Object.keys(crossings).length} file(s).`,
  );
} else {
  console.log(
    `[dry-run] ${total} crossing(s) across ${Object.keys(crossings).length} file(s). Pass --write to save.`,
  );
}
