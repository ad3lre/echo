#!/usr/bin/env node
/**
 * New-code charter enforcement (docs/echo-code-charter.md + docs/overview/agents.md).
 *
 * - Pre-2026-06-01 paths in server/ops/scripts/new-code-charter-grandfather.json are exempt
 *   from strict new-code rules (ban any, console.log, etc.).
 * - Grandfathered paths with a ceiling in
 *   server/ops/scripts/new-code-charter-grandfather-baselines.json are size-ratcheted
 *   (lines / longest function / nesting may not worsen). CI always enforces
 *   those ceilings; --staged still ratchets when the path is in the staged set.
 * - Post-cutoff paths enrolled in server/ops/scripts/new-code-charter-enrollment.json are
 *   ratcheted (metrics may not worsen).
 * - All other post-cutoff paths must satisfy strict thresholds in
 *   server/ops/scripts/new-code-charter-config.json.
 *
 * Emergency local bypass: ECHO_NEW_CODE_CHARTER_BYPASS=1
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../../..');
const frontendPkg = path.join(repoRoot, 'clients', 'web', 'package.json');
const requireFromFrontend = createRequire(frontendPkg);
const { parse: parseVueSfc } = requireFromFrontend('@vue/compiler-sfc');

const CONFIG_PATH = path.join(__dirname, 'new-code-charter-config.json');
const GRANDFATHER_PATH = path.join(
  __dirname,
  'new-code-charter-grandfather.json',
);
const GRANDFATHER_BASELINE_PATH = path.join(
  __dirname,
  'new-code-charter-grandfather-baselines.json',
);
const ENROLLMENT_PATH = path.join(
  __dirname,
  'new-code-charter-enrollment.json',
);

const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.js', '.jsx']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'tests', '__tests__']);

const EXPLICIT_ANY_RE =
  /:\s*any\b|as\s+any\b|<any\b|\bany\[\]|Array<any>|ReadonlyArray<any>|Record<[^,]+,\s*any>/;
const TS_SUPPRESS_RE = /@ts-ignore|@ts-expect-error|@ts-nocheck/;
const CONSOLE_LOG_RE = /\bconsole\.(log|debug|info|trace)\s*\(/;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/i;
const ISSUE_REF_RE = /#\d+|github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i;
const COMMENTED_CODE_RE =
  /^\s*\/\/\s*(const|let|var|import|export|return|if|for|while|switch|function|class|type|interface)\b/;
const INCLUSIVE_TERM_RE = /\b(blacklist|whitelist)\b/i;
const TIMER_LITERAL_RE =
  /\bset(?:Timeout|Interval)\s*\(\s*[^,]+,\s*(\d{3,})\s*\)/g;
const FUNC_START_RE =
  /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+|^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/;

const MODEL_PATH_RE = /(?:^|\/)(domain|viewModel)\//;
const CONTROLLER_PATH_RE =
  /(?:^|\/)composables\/|(?:^|\/)services\/(?:orchestration|realtime)\//;
const LAYER_GUARD_PATH_RE =
  /(?:^|\/)components\/|(?:^|\/)composables\/|(?:^|\/)services\/(?:orchestration|realtime)\//;

export function isTestPath(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.includes('/tests/') ||
    /\.test\.[^/]+$/.test(rel) ||
    /\.integration\.[^/]+$/.test(rel)
  );
}

export function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`check-new-code-charter: missing ${label} at ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadConfig() {
  return loadJson(CONFIG_PATH, 'config');
}

export function loadGrandfatherPaths() {
  const raw = loadJson(GRANDFATHER_PATH, 'grandfather manifest');
  const paths = raw.paths ?? raw;
  if (!Array.isArray(paths)) {
    throw new Error(
      'check-new-code-charter: grandfather manifest must contain a paths array',
    );
  }
  return new Set(paths);
}

export function loadEnrollment() {
  if (!fs.existsSync(ENROLLMENT_PATH)) {
    return { files: {} };
  }
  const raw = loadJson(ENROLLMENT_PATH, 'enrollment');
  if (!raw.files || typeof raw.files !== 'object') {
    throw new Error(
      'check-new-code-charter: enrollment must contain a files object',
    );
  }
  return raw;
}

export function loadGrandfatherBaselines() {
  if (!fs.existsSync(GRANDFATHER_BASELINE_PATH)) {
    return { files: {} };
  }
  const raw = loadJson(GRANDFATHER_BASELINE_PATH, 'grandfather baselines');
  if (!raw.files || typeof raw.files !== 'object') {
    throw new Error(
      'check-new-code-charter: grandfather baselines must contain a files object',
    );
  }
  return raw;
}

function walkSourceFiles(scopes, files = []) {
  for (const scope of scopes) {
    const dir = path.join(repoRoot, scope);
    if (!fs.existsSync(dir)) continue;
    walkDir(dir, files);
  }
  return files;
}

function walkDir(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkDir(full, files);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(full);
  }
}

function relPosix(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

export function extractScriptSource(rel, content) {
  if (!rel.endsWith('.vue')) return content;
  const { descriptor } = parseVueSfc(content, { filename: rel });
  const parts = [];
  if (descriptor.script?.content) parts.push(descriptor.script.content);
  if (descriptor.scriptSetup?.content)
    parts.push(descriptor.scriptSetup.content);
  return parts.join('\n');
}

export function scanFunctionBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    if (!FUNC_START_RE.test(lines[i])) continue;

    let braceLine = i;
    while (braceLine < lines.length && !lines[braceLine].includes('{')) {
      braceLine++;
    }
    if (braceLine >= lines.length) continue;

    let depth = 0;
    let started = false;
    let endLine = braceLine;
    for (let j = braceLine; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        }
        if (ch === '}') depth--;
      }
      if (started && depth === 0) {
        endLine = j;
        break;
      }
    }

    blocks.push({
      startLine: i + 1,
      lineCount: endLine - i + 1,
      preview: lines[i].trim().slice(0, 100),
    });
  }

  return blocks;
}

export function countDeepNestingLines(source, thresholdSpaces) {
  const lines = source.split(/\r?\n/);
  const deepLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }
    const spaces = (line.match(/^(\s*)/) ?? ['', ''])[1].length;
    if (spaces > thresholdSpaces) {
      deepLines.push(i + 1);
    }
  }
  return deepLines;
}

function lineHasNamedTimerContext(lines, lineIndex) {
  const window = [
    lines[lineIndex - 1] ?? '',
    lines[lineIndex] ?? '',
    lines[lineIndex + 1] ?? '',
  ].join('\n');
  return /[A-Z][A-Z0-9_]*_MS\b/.test(window);
}

export function analyzeFile(rel, content, config) {
  const script = extractScriptSource(rel, content);
  const fileLines = content.split(/\r?\n/).length;
  const functions = scanFunctionBlocks(script);
  const longestFunction = functions.reduce(
    (max, fn) => Math.max(max, fn.lineCount),
    0,
  );
  const deepLines = countDeepNestingLines(
    script,
    config.strict.maxNestingSpaces,
  );

  let maxNestingSpaces = 0;
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }
    const spaces = (line.match(/^(\s*)/) ?? ['', ''])[1].length;
    if (spaces > maxNestingSpaces) maxNestingSpaces = spaces;
  }

  const metrics = {
    lines: fileLines,
    longestFunction,
    deepNestingLines: deepLines.length,
    maxNestingSpaces,
  };

  return { metrics, functions, script, fileLines };
}

function pushRuleViolations(rel, content, script, config, violations) {
  const { rules } = config;
  const lines = script.split(/\r?\n/);
  const allLines = content.split(/\r?\n/);

  if (rules.banExplicitAny) {
    for (let i = 0; i < lines.length; i++) {
      if (EXPLICIT_ANY_RE.test(lines[i])) {
        violations.push({
          rule: 'C9',
          line: i + 1,
          message: 'explicit any is forbidden in post-cutoff code',
        });
      }
    }
  }

  if (rules.banTsSuppressions) {
    for (let i = 0; i < lines.length; i++) {
      if (TS_SUPPRESS_RE.test(lines[i])) {
        violations.push({
          rule: 'C9',
          line: i + 1,
          message: '@ts-ignore / @ts-expect-error / @ts-nocheck is forbidden',
        });
      }
    }
  }

  if (rules.banConsoleLog) {
    for (let i = 0; i < lines.length; i++) {
      if (CONSOLE_LOG_RE.test(lines[i])) {
        violations.push({
          rule: 'C12',
          line: i + 1,
          message: 'console.log/debug/info/trace is forbidden in runtime code',
        });
      }
    }
  }

  if (rules.banTodoWithoutIssue) {
    for (let i = 0; i < allLines.length; i++) {
      if (!TODO_RE.test(allLines[i])) continue;
      if (ISSUE_REF_RE.test(allLines[i])) continue;
      violations.push({
        rule: 'C7',
        line: i + 1,
        message: 'TODO/FIXME/HACK/XXX requires a tracked issue reference (#N)',
      });
    }
  }

  if (rules.banCommentedOutCode) {
    for (let i = 0; i < lines.length; i++) {
      if (COMMENTED_CODE_RE.test(lines[i])) {
        violations.push({
          rule: 'C7',
          line: i + 1,
          message: 'commented-out code is forbidden',
        });
      }
    }
  }

  if (rules.banInclusiveTerms) {
    for (let i = 0; i < allLines.length; i++) {
      if (INCLUSIVE_TERM_RE.test(allLines[i])) {
        violations.push({
          rule: 'C5',
          line: i + 1,
          message: 'use allowlist/denylist instead of whitelist/blacklist',
        });
      }
    }
  }

  if (rules.banProcessExit && /\bprocess\.exit\s*\(/.test(script)) {
    const allowed = (config.processExitAllowPrefixes ?? []).some((prefix) =>
      rel.startsWith(prefix),
    );
    if (!allowed) {
      violations.push({
        rule: 'C10',
        message: 'process.exit is forbidden outside scripts/ entrypoints',
      });
    }
  }

  if (rules.requireNamedTimerLiterals) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      TIMER_LITERAL_RE.lastIndex = 0;
      while ((match = TIMER_LITERAL_RE.exec(line))) {
        if (!lineHasNamedTimerContext(lines, i)) {
          violations.push({
            rule: 'C6',
            line: i + 1,
            message: `timer literal ${match[1]}ms must use a named *_MS constant`,
          });
        }
      }
    }
  }

  if (rules.enforceLayerBoundaries) {
    if (MODEL_PATH_RE.test(rel) || rel.startsWith('clients/web/src/stores/')) {
      if (/from\s+['"][^'"]+\.vue['"]/.test(script)) {
        violations.push({
          rule: 'MVC',
          message: 'model/viewModel/store must not import .vue components',
        });
      }
      if (/\b(useRouter|useRoute)\b/.test(script)) {
        violations.push({
          rule: 'MVC',
          message: 'model/viewModel/store must not use Vue Router',
        });
      }
      if (/\b(document\.|window\.|addEventListener)\b/.test(script)) {
        violations.push({
          rule: 'MVC',
          message: 'model/viewModel/store must not touch DOM/window APIs',
        });
      }
    }

    if (CONTROLLER_PATH_RE.test(rel) && rel.endsWith('.ts')) {
      if (/from\s+['"][^'"]+\.vue['"]/.test(script)) {
        violations.push({
          rule: 'MVC',
          message: 'controller/orchestration must not import .vue components',
        });
      }
    }

    if (LAYER_GUARD_PATH_RE.test(rel) && !MODEL_PATH_RE.test(rel)) {
      for (const symbol of config.workspaceMergeForbidden ?? []) {
        if (script.includes(symbol)) {
          violations.push({
            rule: 'MVC',
            message: `workspace merge authority ${symbol} is forbidden in this layer`,
          });
        }
      }
    }
  }
}

function pushMetricCeilingViolations(metrics, ceiling, violations, label) {
  if (metrics.lines > ceiling.lines) {
    violations.push({
      rule: 'C4',
      message: `file grew to ${metrics.lines} lines (${label} ceiling ${ceiling.lines})`,
    });
  }
  if (metrics.longestFunction > ceiling.longestFunction) {
    violations.push({
      rule: 'C3',
      message: `longest function grew to ${metrics.longestFunction} lines (${label} ceiling ${ceiling.longestFunction})`,
    });
  }
  if (metrics.deepNestingLines > ceiling.deepNestingLines) {
    violations.push({
      rule: 'C1',
      message: `deep nesting lines grew to ${metrics.deepNestingLines} (${label} ceiling ${ceiling.deepNestingLines})`,
    });
  }
  if (metrics.maxNestingSpaces > ceiling.maxNestingSpaces) {
    violations.push({
      rule: 'C1',
      message: `max nesting depth grew to ${metrics.maxNestingSpaces} spaces (${label} ceiling ${ceiling.maxNestingSpaces})`,
    });
  }
}

export function evaluateFile(
  rel,
  content,
  config,
  grandfather,
  enrollment,
  grandfatherBaselines = { files: {} },
) {
  if (isTestPath(rel)) {
    return { rel, skipped: true, violations: [], metrics: null };
  }

  const grandfatherCeiling = grandfatherBaselines.files?.[rel];
  if (grandfather.has(rel)) {
    if (!grandfatherCeiling) {
      return { rel, skipped: true, violations: [], metrics: null };
    }
    const { metrics } = analyzeFile(rel, content, config);
    const violations = [];
    pushMetricCeilingViolations(
      metrics,
      grandfatherCeiling,
      violations,
      'grandfather',
    );
    return {
      rel,
      skipped: false,
      grandfatherRatchet: true,
      violations,
      metrics,
    };
  }

  const { metrics, functions, script } = analyzeFile(rel, content, config);
  const violations = [];

  pushRuleViolations(rel, content, script, config, violations);

  const enrolled = enrollment.files[rel];
  if (enrolled) {
    pushMetricCeilingViolations(metrics, enrolled, violations, 'enrolled');
  } else {
    const { strict } = config;
    if (metrics.lines > strict.maxFileLines) {
      violations.push({
        rule: 'C4',
        message: `file has ${metrics.lines} lines (strict max ${strict.maxFileLines})`,
      });
    }
    if (metrics.longestFunction > strict.maxFunctionLines) {
      const offender = functions.find(
        (fn) => fn.lineCount === metrics.longestFunction,
      );
      violations.push({
        rule: 'C3',
        line: offender?.startLine,
        message: `longest function is ${metrics.longestFunction} lines (strict max ${strict.maxFunctionLines})`,
      });
    }
    const deepLines = countDeepNestingLines(script, strict.maxNestingSpaces);
    if (deepLines.length > strict.maxDeepNestingLines) {
      violations.push({
        rule: 'C1',
        message: `${deepLines.length} line(s) exceed ${strict.maxNestingSpaces}-space nesting (lines: ${deepLines.slice(0, 5).join(', ')}${deepLines.length > 5 ? ', …' : ''})`,
      });
    }
  }

  return { rel, skipped: false, violations, metrics };
}

export function checkNewCodeCharter(opts = {}) {
  const config = opts.config ?? loadConfig();
  const grandfather = opts.grandfather ?? loadGrandfatherPaths();
  const enrollment = opts.enrollment ?? loadEnrollment();
  const grandfatherBaselines =
    opts.grandfatherBaselines ?? loadGrandfatherBaselines();
  const scopes = opts.scopes ?? config.scopes;

  const onlyPaths = opts.onlyPaths;
  const absFiles = walkSourceFiles(scopes);
  const results = [];
  const seen = new Set();

  for (const absPath of absFiles) {
    const rel = relPosix(absPath);
    if (onlyPaths && !onlyPaths.has(rel)) continue;
    seen.add(rel);
    const content = fs.readFileSync(absPath, 'utf8');
    results.push(
      evaluateFile(
        rel,
        content,
        config,
        grandfather,
        enrollment,
        grandfatherBaselines,
      ),
    );
  }

  // Always ratchet grandfather baselines that exist, even outside config.scopes
  // (legacy cutoff paths such as server/backend/crypto and server/media).
  for (const rel of Object.keys(grandfatherBaselines.files ?? {})) {
    if (seen.has(rel)) continue;
    if (onlyPaths && !onlyPaths.has(rel)) continue;
    const absPath = path.join(repoRoot, rel);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    results.push(
      evaluateFile(
        rel,
        content,
        config,
        grandfather,
        enrollment,
        grandfatherBaselines,
      ),
    );
  }

  const violations = results.filter((r) => !r.skipped && r.violations.length);
  const staleEnrollment = Object.keys(enrollment.files).filter(
    (rel) => !fs.existsSync(path.join(repoRoot, rel)),
  );
  const staleGrandfatherBaselines = opts.skipStaleCheck
    ? []
    : Object.keys(grandfatherBaselines.files ?? {}).filter(
        (rel) => !fs.existsSync(path.join(repoRoot, rel)),
      );

  const missingGrandfatherBaselines = [];
  for (const rel of grandfather) {
    if (onlyPaths && !onlyPaths.has(rel)) continue;
    if (isTestPath(rel)) continue;
    if (!fs.existsSync(path.join(repoRoot, rel))) continue;
    if (!grandfatherBaselines.files?.[rel]) {
      missingGrandfatherBaselines.push(rel);
    }
  }

  return {
    results,
    violations,
    staleEnrollment,
    staleGrandfatherBaselines,
    missingGrandfatherBaselines,
  };
}

function stagedPaths() {
  try {
    const staged = execSync(
      'git diff --cached --name-only --diff-filter=ACMR',
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
    const paths = staged
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paths.length ? new Set(paths) : null;
  } catch {
    return null;
  }
}

function printViolations({
  violations,
  staleEnrollment,
  staleGrandfatherBaselines = [],
  missingGrandfatherBaselines = [],
}) {
  let failed = false;

  if (violations.length) {
    failed = true;
    const grandfatherCount = violations.filter(
      (entry) => entry.grandfatherRatchet,
    ).length;
    const postCutoffCount = violations.length - grandfatherCount;
    const parts = [];
    if (postCutoffCount) parts.push(`${postCutoffCount} post-cutoff`);
    if (grandfatherCount) parts.push(`${grandfatherCount} grandfather`);
    console.error(
      `\ncheck-new-code-charter: ${violations.length} file(s) failed (${parts.join(', ')}):`,
    );
    for (const entry of violations) {
      console.error(`\n  ${entry.rel}`);
      for (const v of entry.violations) {
        const loc = v.line ? `:${v.line}` : '';
        console.error(`    [${v.rule}]${loc} ${v.message}`);
      }
    }
    console.error(
      '\nSee docs/echo-code-charter.md and docs/overview/agents.md.',
    );
    console.error(
      'June-era enrolled files: run server/ops/scripts/generate-new-code-charter-enrollment.mjs --write after intentional metric bumps.',
    );
    console.error(
      'Grandfathered files: extract to shrink, or refresh ceilings via server/ops/scripts/generate-new-code-charter-grandfather-baselines.mjs --write.',
    );
  }

  if (staleEnrollment.length) {
    failed = true;
    console.error(
      `\ncheck-new-code-charter: ${staleEnrollment.length} stale enrollment path(s):`,
    );
    for (const rel of staleEnrollment.sort()) {
      console.error(`  ${rel}`);
    }
    console.error(
      '\nRemove stale entries via server/ops/scripts/generate-new-code-charter-enrollment.mjs --write',
    );
  }

  if (staleGrandfatherBaselines.length) {
    failed = true;
    console.error(
      `\ncheck-new-code-charter: ${staleGrandfatherBaselines.length} stale grandfather baseline path(s):`,
    );
    for (const rel of staleGrandfatherBaselines.sort()) {
      console.error(`  ${rel}`);
    }
    console.error(
      '\nRemove stale entries via server/ops/scripts/generate-new-code-charter-grandfather-baselines.mjs --write',
    );
  }

  if (missingGrandfatherBaselines.length) {
    failed = true;
    console.error(
      `\ncheck-new-code-charter: ${missingGrandfatherBaselines.length} grandfather path(s) missing a baseline:`,
    );
    for (const rel of missingGrandfatherBaselines.sort()) {
      console.error(`  ${rel}`);
    }
    console.error(
      '\nSnapshot ceilings via server/ops/scripts/generate-new-code-charter-grandfather-baselines.mjs --write',
    );
  }

  return failed;
}

function main() {
  if (process.env.ECHO_NEW_CODE_CHARTER_BYPASS === '1') {
    console.warn(
      'check-new-code-charter: skipped (ECHO_NEW_CODE_CHARTER_BYPASS=1)',
    );
    process.exit(0);
  }

  const stagedOnly = process.argv.includes('--staged');
  let onlyPaths;
  if (stagedOnly) {
    onlyPaths = stagedPaths();
    if (!onlyPaths) process.exit(0);
  }

  const result = checkNewCodeCharter({
    onlyPaths,
    skipStaleCheck: Boolean(stagedOnly),
  });
  if (printViolations(result)) {
    console.error(
      '\nEmergency bypass (local only): ECHO_NEW_CODE_CHARTER_BYPASS=1',
    );
    process.exit(1);
  }

  const checked = result.results.filter(
    (r) => !r.skipped && !r.grandfatherRatchet,
  ).length;
  const grandfatherChecked = result.results.filter(
    (r) => r.grandfatherRatchet,
  ).length;
  console.log(
    `check-new-code-charter: ok (${checked} post-cutoff file(s), ${grandfatherChecked} grandfather file(s) ratcheted)`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
