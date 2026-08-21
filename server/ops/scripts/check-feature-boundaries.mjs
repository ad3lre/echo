#!/usr/bin/env node
/**
 * Feature import-boundary guard (docs/overview/code-placement.md — import rule).
 *
 * Echo's frontend is organised into feature modules under clients/web/src/features/.
 * The charter rule: **feature A must not import feature B's INTERNALS**
 * (components/ composables/ stores/ services/ editor/). Cross-feature
 * coordination goes through a composer feature (the app shell — `layout`),
 * shared utils, or @/api. Importing a feature's *public surface* (its root-level
 * files / index barrel) is always allowed.
 *
 * This guard blocks NEW boundary crossings. Every crossing that exists today is
 * grandfathered in scripts/feature-boundaries-allowlist.json. That list may only
 * SHRINK: a stale entry (no longer a real import) also fails the build, so each
 * fix is permanent. Generate/refresh the allowlist with:
 *   node server/ops/scripts/generate-feature-boundaries-allowlist.mjs --write
 *
 * Composer features (config.composerFeatures) are the sanctioned composition
 * roots and are exempt as importers — they wire the other features together.
 *
 * Emergency local bypass: ECHO_FEATURE_BOUNDARIES_BYPASS=1
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const CONFIG_PATH = path.join(
  repoRoot,
  'server',
  'ops',
  'scripts',
  'feature-boundaries-config.json',
);
const ALLOWLIST_PATH = path.join(
  repoRoot,
  'server',
  'ops',
  'scripts',
  'feature-boundaries-allowlist.json',
);

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'tests']);
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue']);

function loadJson(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`check-feature-boundaries: missing ${label} at ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function isTest(rel) {
  return /\.(test|spec|integration)\./.test(rel);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.has(path.extname(name))) out.push(p);
  }
  return out;
}

// Collect every import/export specifier string in a source file.
const SPEC_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g, // import x from '…' / export … from '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('…')
];
function specifiersOf(text) {
  const out = new Set();
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) out.add(m[1]);
  }
  return [...out];
}

// Resolve an import specifier to a repo-relative posix path, or null if it is a
// bare package import (node_modules) we don't police.
function resolveSpecifier(spec, fromFileAbs) {
  let abs;
  if (spec.startsWith('@/'))
    abs = path.join(repoRoot, 'clients', 'web', 'src', spec.slice(2));
  else if (spec.startsWith('.'))
    abs = path.resolve(path.dirname(fromFileAbs), spec);
  else return null;
  return relPosix(abs);
}

/**
 * Scan all feature files for cross-feature INTERNAL imports.
 * Returns [{ file, spec, fromFeature, toFeature, toDir }] (file = repo-relative).
 * Pure detection — does not consult the allowlist.
 */
export function collectCrossFeatureViolations() {
  const cfg = loadJson(CONFIG_PATH, 'config');
  const featuresRoot = cfg.featuresRoot.replace(/\/+$/, '');
  const internalDirs = new Set(cfg.internalDirs);
  const composer = new Set(cfg.composerFeatures || []);
  const featuresAbs = path.join(repoRoot, ...featuresRoot.split('/'));

  const violations = [];
  for (const fileAbs of walk(featuresAbs)) {
    const rel = relPosix(fileAbs);
    if (isTest(rel) || rel.endsWith('.d.ts')) continue;
    const afterRoot = rel.slice(featuresRoot.length + 1); // "<feature>/…"
    const fromFeature = afterRoot.split('/')[0];
    if (composer.has(fromFeature)) continue; // sanctioned composition root

    for (const spec of specifiersOf(readFileSync(fileAbs, 'utf8'))) {
      const target = resolveSpecifier(spec, fileAbs);
      if (!target || !target.startsWith(`${featuresRoot}/`)) continue;
      const segs = target.slice(featuresRoot.length + 1).split('/');
      const toFeature = segs[0];
      const toDir = segs[1];
      if (toFeature === fromFeature) continue; // same feature — fine
      if (!internalDirs.has(toDir)) continue; // public surface (root file / index) — fine
      violations.push({ file: rel, spec, fromFeature, toFeature, toDir });
    }
  }
  return violations;
}

/**
 * Compare today's crossings against the allowlist. Pure (no exit / logging) so
 * it is unit-testable. Returns new violations, stale allowlist entries, and the
 * grandfathered totals.
 */
export function evaluateFeatureBoundaries() {
  const allow = loadJson(ALLOWLIST_PATH, 'allowlist');
  const grandfathered = allow.crossings || {};
  const violations = collectCrossFeatureViolations();

  // Track which allowlist (file, spec) pairs actually fired, to catch stale ones.
  const seen = new Set();
  const newViolations = [];
  for (const v of violations) {
    const allowedSpecs = grandfathered[v.file];
    if (allowedSpecs && allowedSpecs.includes(v.spec)) {
      seen.add(`${v.file} ${v.spec}`);
      continue;
    }
    newViolations.push(v);
  }

  const staleEntries = [];
  for (const [file, specs] of Object.entries(grandfathered)) {
    for (const spec of specs) {
      if (!seen.has(`${file} ${spec}`)) staleEntries.push({ file, spec });
    }
  }

  return {
    newViolations,
    staleEntries,
    grandfatheredFiles: Object.keys(grandfathered).length,
    grandfatheredTotal: violations.length - newViolations.length,
  };
}

function main() {
  if (process.env.ECHO_FEATURE_BOUNDARIES_BYPASS === '1') {
    console.warn(
      'check-feature-boundaries: skipped (ECHO_FEATURE_BOUNDARIES_BYPASS=1)',
    );
    process.exit(0);
  }

  const {
    newViolations,
    staleEntries,
    grandfatheredFiles,
    grandfatheredTotal,
  } = evaluateFeatureBoundaries();

  const errors = [];
  if (newViolations.length) {
    errors.push(
      `${newViolations.length} new cross-feature internal import(s) — route through the feature's public surface, a shared util, or the composer (layout):`,
    );
    for (const v of newViolations.sort((a, b) =>
      a.file.localeCompare(b.file),
    )) {
      errors.push(
        `  ${v.file}\n      imports ${v.spec}  (${v.fromFeature} -> ${v.toFeature}/${v.toDir})`,
      );
    }
  }
  if (staleEntries.length) {
    errors.push(
      `${staleEntries.length} stale allowlist entr(ies) — the import is gone; delete them so the boundary can't regress:`,
    );
    for (const e of staleEntries.sort((a, b) => a.file.localeCompare(b.file))) {
      errors.push(`  ${e.file}  ->  ${e.spec}`);
    }
  }

  if (errors.length) {
    console.error('check-feature-boundaries: FAILED');
    for (const e of errors) console.error(e);
    console.error(
      '\nSee docs/overview/code-placement.md. Refresh the allowlist after fixing crossings:\n  node server/ops/scripts/generate-feature-boundaries-allowlist.mjs --write\nEmergency local bypass: ECHO_FEATURE_BOUNDARIES_BYPASS=1',
    );
    process.exit(1);
  }

  console.log(
    `check-feature-boundaries: ok (${grandfatheredTotal} grandfathered crossing(s) across ${grandfatheredFiles} file(s))`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
