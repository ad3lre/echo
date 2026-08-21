#!/usr/bin/env node
/**
 * Apple client maintainability gate.
 *
 * Enforces the quality bar established during the Aug 2026 Apple audit pushes:
 * - No god-files in Apps/Modules (hard LOC ceiling)
 * - Thin Apps/ composition roots
 * - Color literals only in the theme / welcome-art allowlist
 * - Raw English Text/Button/Label/TextField copy must use EchoCopy
 * - String Catalog must cover `en` + `es` for every key
 * - Module import direction (Domain/Persistence stay UI-free)
 * - No debug print() in production sources
 *
 * Emergency local bypass: ECHO_APPLE_MAINTAINABILITY_BYPASS=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appleRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appleRoot, '../..');

/** Production Sources under Modules/ and Apps/ may not exceed this. */
export const MAX_SOURCE_FILE_LOC = 650;
/** Individual app entry files stay thin composition roots. */
export const MAX_APP_FILE_LOC = 120;
/** Combined Apps/ Swift LOC budget. */
export const MAX_APPS_TOTAL_LOC = 250;
/** Test files get more room for URLProtocol fixtures. */
export const MAX_TEST_FILE_LOC = 600;

/** Files allowed to define raw Color(red:) / platformColor(red:) literals. */
export const COLOR_LITERAL_ALLOWLIST = new Set([
  'Modules/EchoFeatures/Sources/Shared/EchoTheme.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoWelcomeScene.swift',
]);

/**
 * EchoFeatures files allowed to keep raw English UI literals.
 * Theme/welcome art, markdown internals, and EchoCopy itself.
 */
export const RAW_UI_COPY_ALLOWLIST = new Set([
  'Modules/EchoFeatures/Sources/Shared/EchoTheme.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoWelcomeScene.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoWelcomeView.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoCopy.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoMarkdownView.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoMarkdownParser.swift',
  'Modules/EchoFeatures/Sources/Shared/EchoMarkdownModels.swift',
]);

/** Raw user-facing SwiftUI copy that should go through EchoCopy. */
const RAW_UI_COPY_RE =
  /\b(?:Text|Button|Label|TextField|SecureField|ContentUnavailableView)\(\s*"((?:\\.|[^"\\])*)"/g;

/**
 * Count raw English SwiftUI string literals (allows Text("\(…)") interpolations).
 * @param {string} text
 * @returns {number}
 */
export function countRawUiCopy(text) {
  let count = 0;
  RAW_UI_COPY_RE.lastIndex = 0;
  let match;
  while ((match = RAW_UI_COPY_RE.exec(text)) !== null) {
    const body = match[1];
    // Pure interpolation like Text("\(value)") / Text("@\(user)") is not copy.
    if (body.startsWith('\\(') || body.startsWith('@\\(')) continue;
    count += 1;
  }
  return count;
}

const FORBIDDEN_IMPORTS = [
  {
    roots: ['Modules/EchoDomain'],
    ban: /\bimport\s+(SwiftUI|UIKit|AppKit|EchoFeatures|EchoNetworking|EchoPersistence)\b/,
    label: 'EchoDomain must stay platform- and UI-free',
  },
  {
    roots: ['Modules/EchoPersistence'],
    ban: /\bimport\s+(SwiftUI|UIKit|AppKit|EchoFeatures|EchoNetworking)\b/,
    label: 'EchoPersistence must not depend on Features/Networking/UI',
  },
  {
    roots: ['Modules/EchoNetworking'],
    ban: /\bimport\s+(SwiftUI|UIKit|AppKit|EchoFeatures)\b/,
    label: 'EchoNetworking must not depend on Features/UI',
  },
];

const COLOR_LITERAL_RE =
  /\b(?:Color|platformColor)\(\s*red:\s*(?:0\.\d+|\d+\s*\/\s*255)/g;
const PRINT_RE = /\bprint\s*\(/g;

/**
 * @param {string} filePath
 * @returns {number}
 */
export function countLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

/**
 * @param {string} dir
 * @param {(name: string) => boolean} [filter]
 * @returns {string[]}
 */
function walkSwift(dir, filter = () => true, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.build' || entry.name === 'EchoApple.xcodeproj')
        continue;
      walkSwift(full, filter, files);
      continue;
    }
    if (entry.name.endsWith('.swift') && filter(entry.name)) files.push(full);
  }
  return files;
}

/**
 * @param {{ appleRoot?: string }} [opts]
 */
export function checkAppleMaintainability(opts = {}) {
  const root = opts.appleRoot ? path.resolve(opts.appleRoot) : appleRoot;
  const violations = [];
  const toRel = (absPath) =>
    path.relative(root, absPath).split(path.sep).join('/');

  const moduleFiles = walkSwift(path.join(root, 'Modules'));
  const appFiles = walkSwift(path.join(root, 'Apps'));
  const testFiles = walkSwift(path.join(root, 'Tests'));
  const sourceFiles = [...moduleFiles, ...appFiles];

  for (const abs of moduleFiles) {
    const lines = countLines(abs);
    if (lines > MAX_SOURCE_FILE_LOC) {
      violations.push({
        kind: 'god-file',
        rel: toRel(abs),
        detail: `${lines} lines > ${MAX_SOURCE_FILE_LOC} (Modules)`,
      });
    }
  }

  let appsTotal = 0;
  for (const abs of appFiles) {
    const lines = countLines(abs);
    appsTotal += lines;
    if (lines > MAX_APP_FILE_LOC) {
      violations.push({
        kind: 'thick-app',
        rel: toRel(abs),
        detail: `${lines} lines > ${MAX_APP_FILE_LOC} (Apps file budget)`,
      });
    }
  }
  if (appsTotal > MAX_APPS_TOTAL_LOC) {
    violations.push({
      kind: 'thick-apps-total',
      rel: 'Apps/',
      detail: `${appsTotal} lines > ${MAX_APPS_TOTAL_LOC} (Apps total budget)`,
    });
  }

  for (const abs of testFiles) {
    const lines = countLines(abs);
    if (lines > MAX_TEST_FILE_LOC) {
      violations.push({
        kind: 'god-test',
        rel: toRel(abs),
        detail: `${lines} lines > ${MAX_TEST_FILE_LOC} (Tests)`,
      });
    }
  }

  for (const abs of sourceFiles) {
    const rel = toRel(abs);
    const text = fs.readFileSync(abs, 'utf8');

    if (!COLOR_LITERAL_ALLOWLIST.has(rel)) {
      const matches = text.match(COLOR_LITERAL_RE) ?? [];
      if (matches.length) {
        violations.push({
          kind: 'color-literal',
          rel,
          detail: `${matches.length} Color(red:…)/platformColor(red:…) — use EchoTheme (allowlist: Theme + WelcomeScene)`,
        });
      }
    }

    const prints = text.match(PRINT_RE) ?? [];
    if (prints.length) {
      violations.push({
        kind: 'debug-print',
        rel,
        detail: `${prints.length} print(…) call(s)`,
      });
    }

    if (
      rel.startsWith('Modules/EchoFeatures/Sources/') &&
      !RAW_UI_COPY_ALLOWLIST.has(rel)
    ) {
      const rawCopy = countRawUiCopy(text);
      if (rawCopy > 0) {
        violations.push({
          kind: 'raw-ui-copy',
          rel,
          detail: `${rawCopy} raw Text/Button/Label/TextField("…") — use EchoCopy (String Catalog)`,
        });
      }
    }
  }

  const catalog = path.join(
    root,
    'Modules/EchoFeatures/Resources/Localizable.xcstrings',
  );
  if (!fs.existsSync(catalog)) {
    violations.push({
      kind: 'missing-catalog',
      rel: 'Modules/EchoFeatures/Resources/Localizable.xcstrings',
      detail: 'String Catalog required for EchoFeatures localization',
    });
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(catalog, 'utf8'));
      const entries = parsed.strings ?? {};
      let missingEs = 0;
      let missingEn = 0;
      for (const [key, entry] of Object.entries(entries)) {
        const locs = entry?.localizations ?? {};
        if (!locs.en?.stringUnit?.value) missingEn += 1;
        if (!locs.es?.stringUnit?.value) missingEs += 1;
      }
      if (missingEn || missingEs) {
        violations.push({
          kind: 'catalog-locale-coverage',
          rel: 'Modules/EchoFeatures/Resources/Localizable.xcstrings',
          detail: `${Object.keys(entries).length} keys; missing en=${missingEn}, es=${missingEs} (require en + es)`,
        });
      }
    } catch (error) {
      violations.push({
        kind: 'catalog-locale-coverage',
        rel: 'Modules/EchoFeatures/Resources/Localizable.xcstrings',
        detail: `Could not parse String Catalog: ${error instanceof Error ? error.message : error}`,
      });
    }
  }

  for (const rule of FORBIDDEN_IMPORTS) {
    for (const rootName of rule.roots) {
      for (const abs of walkSwift(path.join(root, rootName))) {
        const text = fs.readFileSync(abs, 'utf8');
        if (rule.ban.test(text)) {
          violations.push({
            kind: 'import-boundary',
            rel: toRel(abs),
            detail: rule.label,
          });
        }
      }
    }
  }

  return {
    violations,
    stats: {
      moduleFiles: moduleFiles.length,
      appFiles: appFiles.length,
      testFiles: testFiles.length,
      appsTotal,
    },
  };
}

function main() {
  if (process.env.ECHO_APPLE_MAINTAINABILITY_BYPASS === '1') {
    console.warn(
      'check-apple-maintainability: skipped (ECHO_APPLE_MAINTAINABILITY_BYPASS=1)',
    );
    process.exit(0);
  }

  const result = checkAppleMaintainability();
  if (result.violations.length) {
    console.error(
      `\ncheck-apple-maintainability: ${result.violations.length} violation(s):`,
    );
    const byKind = new Map();
    for (const v of result.violations) {
      if (!byKind.has(v.kind)) byKind.set(v.kind, []);
      byKind.get(v.kind).push(v);
    }
    for (const [kind, items] of [...byKind.entries()].sort()) {
      console.error(`\n[${kind}]`);
      for (const v of items) {
        console.error(`  ${v.rel}`);
        console.error(`    ${v.detail}`);
      }
    }
    console.error(
      '\nFix the violation, or (local only) ECHO_APPLE_MAINTAINABILITY_BYPASS=1',
    );
    console.error(
      `Repo path: ${path.relative(repoRoot, appleRoot) || 'clients/apple'}`,
    );
    process.exit(1);
  }

  console.log(
    `check-apple-maintainability: ok (${result.stats.moduleFiles} module, ${result.stats.appFiles} app, ${result.stats.testFiles} test files; Apps total ${result.stats.appsTotal} LOC)`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
