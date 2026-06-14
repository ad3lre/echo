#!/usr/bin/env node
/**
 * Frontend code placement guard (docs/overview/code-placement.md).
 *
 * Rules:
 *   CP-1  components/ files must be Echo* primitives, config primitives, or grandfathered legacy
 *   CP-2  new files under components/<subdir>/ are forbidden (subdirs must empty out)
 *   CP-4  components/ file count must not exceed the ratchet baseline
 *   CP-5  grandfather allowlist may only shrink (stale / unused entries fail)
 *
 * Emergency local bypass: ECHO_CODE_PLACEMENT_BYPASS=1
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(
  repoRoot,
  'scripts',
  'code-placement-config.json',
);
const ALLOWLIST_PATH = path.join(
  repoRoot,
  'scripts',
  'code-placement-allowlist.json',
);
const BASELINES_PATH = path.join(
  repoRoot,
  'scripts',
  'code-placement-baselines.json',
);

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'tests']);

function loadJson(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`check-code-placement: missing ${label} at ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function walk(dir, extensions, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, extensions, out);
    else if (extensions.has(path.extname(name))) out.push(p);
  }
  return out;
}

function isEchoPrimitive(rel, cfg) {
  const base = path.basename(rel);
  return (
    rel.startsWith(`${cfg.componentsRoot}/`) &&
    base.endsWith('.vue') &&
    base.startsWith(cfg.echoPrimitivePrefix)
  );
}

function isConfigPrimitive(rel, cfg) {
  const base = path.basename(rel);
  return (
    rel.startsWith(`${cfg.componentsRoot}/`) &&
    cfg.primitiveBasenames.includes(base)
  );
}

function isAllowedPrimitive(rel, cfg) {
  return isEchoPrimitive(rel, cfg) || isConfigPrimitive(rel, cfg);
}

function isInComponentsSubdir(rel, cfg) {
  const prefix = `${cfg.componentsRoot}/`;
  if (!rel.startsWith(prefix)) return false;
  const rest = rel.slice(prefix.length);
  return rest.includes('/');
}

function stagedPaths() {
  try {
    const staged = execSync(
      'git diff --cached --name-only --diff-filter=ACMR',
      { cwd: repoRoot, encoding: 'utf8' },
    );
    return staged
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * @param {{ stagedOnly?: boolean }} [opts]
 */
export function checkCodePlacement(opts = {}) {
  const cfg = loadJson(CONFIG_PATH, 'config');
  const allowlist = loadJson(ALLOWLIST_PATH, 'allowlist');
  const baselines = loadJson(BASELINES_PATH, 'baselines');

  const legacyPaths = allowlist.legacyPaths ?? [];
  if (!Array.isArray(legacyPaths)) {
    throw new Error(
      'check-code-placement: allowlist.legacyPaths must be an array',
    );
  }
  const legacySet = new Set(legacyPaths);
  const extensions = new Set(cfg.scannedExtensions);

  if (opts.stagedOnly) {
    const staged = stagedPaths();
    if (!staged?.length) {
      return { errors: [], scanned: 0, staged: true };
    }

    const stagedErrors = [];
    for (const rel of staged) {
      if (!rel.startsWith(`${cfg.componentsRoot}/`)) continue;
      if (!extensions.has(path.extname(rel))) continue;

      const added = gitCachedStatus(rel) === 'A';

      if (isInComponentsSubdir(rel, cfg) && added) {
        stagedErrors.push(
          `${rel}: CP-2 new file in components/<subdir>/ is forbidden — use features/<domain>/`,
        );
      }

      if (isAllowedPrimitive(rel, cfg)) continue;
      if (legacySet.has(rel) && !added) continue;

      stagedErrors.push(
        `${rel}: CP-1 file in components/ must be an Echo* / allowlisted primitive or an existing grandfathered path — see ${cfg.docsUrl}`,
      );
    }

    return { errors: stagedErrors, scanned: staged.length, staged: true };
  }

  const componentsDir = path.join(repoRoot, ...cfg.componentsRoot.split('/'));
  const allComponentFiles = walk(componentsDir, extensions).map(relPosix);
  const errors = [];
  const usedLegacy = new Set();

  for (const rel of allComponentFiles) {
    if (isAllowedPrimitive(rel, cfg)) continue;

    if (legacySet.has(rel)) {
      usedLegacy.add(rel);
      continue;
    }

    errors.push(
      `${rel}: CP-1 not an allowed primitive and not grandfathered — move to features/<domain>/ (see ${cfg.docsUrl})`,
    );
  }

  for (const entry of legacyPaths) {
    const abs = path.join(repoRoot, ...entry.split('/'));
    if (!existsSync(abs)) {
      errors.push(
        `allowlist legacyPaths entry no longer exists: ${entry} — remove it after migration`,
      );
      continue;
    }
    if (!usedLegacy.has(entry)) {
      errors.push(
        `allowlist legacyPaths entry is no longer under components/: ${entry} — remove it from the allowlist`,
      );
    }
  }

  if (legacyPaths.length > baselines.legacyAllowlistCount) {
    errors.push(
      `CP-5 allowlist grew (${legacyPaths.length} > baseline ${baselines.legacyAllowlistCount}) — legacy paths may only shrink`,
    );
  }

  if (allComponentFiles.length > baselines.componentsFileCount) {
    errors.push(
      `CP-4 components/ file count ${allComponentFiles.length} exceeds baseline ${baselines.componentsFileCount} — migrate feature code to features/ or lower the count only after removals`,
    );
  }

  return {
    errors,
    scanned: allComponentFiles.length,
    staged: false,
  };
}

function gitCachedStatus(rel) {
  try {
    const line = execSync(`git diff --cached --name-status -- "${rel}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)[0];
    return line?.charAt(0) ?? '';
  } catch {
    return '';
  }
}

function main() {
  if (process.env.ECHO_CODE_PLACEMENT_BYPASS === '1') {
    console.warn(
      'check-code-placement: skipped (ECHO_CODE_PLACEMENT_BYPASS=1)',
    );
    process.exit(0);
  }

  const stagedOnly = process.argv.includes('--staged');
  const result = checkCodePlacement({ stagedOnly });

  if (result.errors.length) {
    console.error('check-code-placement: FAILED');
    for (const e of result.errors) console.error(`  ${e}`);
    console.error(
      `\nSee docs/overview/code-placement.md and docs/overview/p1-code-placement-program.md.`,
    );
    process.exit(1);
  }

  const scope = result.staged
    ? `staged (${result.scanned} path(s))`
    : `${result.scanned} file(s) under frontend/src/components/`;
  console.log(`check-code-placement: ok (${scope})`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
