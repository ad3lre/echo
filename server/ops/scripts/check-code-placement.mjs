#!/usr/bin/env node
/**
 * Frontend code placement guard (docs/overview/code-placement.md).
 *
 * Rules:
 *   CP-1  components/ files must be Echo* primitives, config primitives, or grandfathered legacy
 *   CP-2  new files under components/<subdir>/ are forbidden (subdirs must empty out)
 *   CP-4  components/ file count must not exceed the ratchet baseline
 *   CP-5  grandfather allowlist may only shrink (stale / unused entries fail)
 *   CP-6  leftover dump folders (utils/, src/composables/, stores/, layout/composables/) may only shrink
 *   CP-7  layer-named folders under features/ need ≥3 source files recursively (no 1-file wrappers)
 *
 * Emergency local bypass: ECHO_CODE_PLACEMENT_BYPASS=1
 */
import { execSync } from 'node:child_process';
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
  'code-placement-config.json',
);
const ALLOWLIST_PATH = path.join(
  repoRoot,
  'server',
  'ops',
  'scripts',
  'code-placement-allowlist.json',
);
const BASELINES_PATH = path.join(
  repoRoot,
  'server',
  'ops',
  'scripts',
  'code-placement-baselines.json',
);

const SKIP_DIRS = new Set(['node_modules', 'dist']);
const SKIP_DIRS_COMPONENTS = new Set([
  'node_modules',
  'dist',
  '__tests__',
  'tests',
]);

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

function walk(dir, extensions, out = [], skipDirs = SKIP_DIRS) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, extensions, out, skipDirs);
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
  const structureErrors = [
    ...checkDumpRatchets(cfg, baselines, extensions),
    ...checkThinLayerFolders(cfg, extensions),
  ];

  if (opts.stagedOnly) {
    const staged = stagedPaths();
    if (!staged?.length) {
      return { errors: structureErrors, scanned: 0, staged: true };
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

    return {
      errors: [...stagedErrors, ...structureErrors],
      scanned: staged.length,
      staged: true,
    };
  }

  const componentsDir = path.join(repoRoot, ...cfg.componentsRoot.split('/'));
  const allComponentFiles = walk(
    componentsDir,
    extensions,
    [],
    SKIP_DIRS_COMPONENTS,
  ).map(relPosix);
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

  errors.push(...structureErrors);

  return {
    errors,
    scanned: allComponentFiles.length,
    staged: false,
  };
}

function countImmediateFiles(dir, extensions) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isFile() && extensions.has(path.extname(name));
  }).length;
}

function checkDumpRatchets(cfg, baselines, extensions) {
  const dumpCounts = baselines.leftoverDumpFileCounts;
  if (!dumpCounts || typeof dumpCounts !== 'object') {
    return [
      'CP-6 baselines.leftoverDumpFileCounts is missing — see docs/overview/code-placement.md',
    ];
  }
  const errors = [];
  const roots = cfg.leftoverDumpRoots ?? [];
  const known = new Set(Object.keys(dumpCounts));
  for (const rel of roots) {
    if (!known.has(rel)) {
      errors.push(
        `CP-6 leftover dump ${rel} has no baseline count — add it to leftoverDumpFileCounts (shrink-only after that)`,
      );
      continue;
    }
    const abs = path.join(repoRoot, ...rel.split('/'));
    const count = walk(abs, extensions).length;
    const baseline = dumpCounts[rel];
    if (count > baseline) {
      errors.push(
        `CP-6 ${rel} has ${count} files (baseline ${baseline}) — leftover dumps may only shrink; put new files in an owning feature or colocate tests with the module (see ${cfg.docsUrl})`,
      );
    }
  }
  for (const rel of known) {
    if (!roots.includes(rel)) {
      errors.push(
        `CP-6 leftoverDumpFileCounts has ${rel} but config.leftoverDumpRoots does not — remove the stale baseline or add the root`,
      );
    }
  }

  const immediateCounts = baselines.leftoverDumpImmediateFileCounts;
  const immediateRoots = cfg.leftoverDumpImmediateRoots ?? [];
  if (immediateRoots.length) {
    if (!immediateCounts || typeof immediateCounts !== 'object') {
      errors.push(
        'CP-6 baselines.leftoverDumpImmediateFileCounts is missing — see docs/overview/code-placement.md',
      );
      return errors;
    }
    const knownImmediate = new Set(Object.keys(immediateCounts));
    for (const rel of immediateRoots) {
      if (!knownImmediate.has(rel)) {
        errors.push(
          `CP-6 immediate dump ${rel} has no baseline count — add it to leftoverDumpImmediateFileCounts`,
        );
        continue;
      }
      const abs = path.join(repoRoot, ...rel.split('/'));
      const count = countImmediateFiles(abs, extensions);
      const baseline = immediateCounts[rel];
      if (count > baseline) {
        errors.push(
          `CP-6 ${rel} has ${count} files at the top (baseline ${baseline}) — nest new files under a durable domain/capability folder instead of growing the flat dump (see ${cfg.docsUrl})`,
        );
      }
    }
    for (const rel of knownImmediate) {
      if (!immediateRoots.includes(rel)) {
        errors.push(
          `CP-6 leftoverDumpImmediateFileCounts has ${rel} but config.leftoverDumpImmediateRoots does not — remove the stale baseline or add the root`,
        );
      }
    }
  }
  return errors;
}

function checkThinLayerFolders(cfg, extensions) {
  const featuresRoot = path.join(repoRoot, ...cfg.featuresRoot.split('/'));
  const layerNames = new Set(cfg.layerDirNames ?? []);
  const minFiles = cfg.minLayerDirFiles ?? 3;
  if (!layerNames.size) return [];
  const errors = [];

  function visit(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name === '__tests__' || name === 'tests') {
        continue;
      }
      const p = path.join(dir, name);
      if (!statSync(p).isDirectory()) continue;
      if (layerNames.has(name)) {
        const here = walk(p, extensions).length;
        if (here < minFiles) {
          errors.push(
            `CP-7 ${relPosix(p)}/ has ${here} source file(s); layer folders need ≥${minFiles} related files — flatten to the parent (see ${cfg.docsUrl})`,
          );
        }
      }
      visit(p);
    }
  }

  visit(featuresRoot);
  return errors;
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
    : `${result.scanned} file(s) under clients/web/src/components/`;
  console.log(`check-code-placement: ok (${scope})`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
