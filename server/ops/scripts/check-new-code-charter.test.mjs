import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkNewCodeCharter,
  countDeepNestingLines,
  evaluateFile,
  extractScriptSource,
  isTestPath,
  scanFunctionBlocks,
} from './check-new-code-charter.mjs';

test('isTestPath skips test fixtures', () => {
  assert.equal(isTestPath('clients/web/src/foo.test.ts'), true);
  assert.equal(isTestPath('clients/web/src/__tests__/bar.ts'), true);
  assert.equal(isTestPath('clients/web/src/components/Foo.vue'), false);
});

test('extractScriptSource reads vue script blocks', () => {
  const vue = `<template><div /></template>
<script setup lang="ts">
const x = 1;
</script>`;
  assert.match(
    extractScriptSource('clients/web/src/Foo.vue', vue),
    /const x = 1/,
  );
});

test('extractScriptSource parses script and scriptSetup via compiler-sfc', () => {
  const vue = `<template><div /></template>
<script lang="ts">
export default { name: 'Foo' };
</script>
<script setup lang="ts">
const y = 2;
</script>`;
  const script = extractScriptSource('clients/web/src/Foo.vue', vue);
  assert.match(script, /export default/);
  assert.match(script, /const y = 2/);
});

test('extractScriptSource ignores external-only script tags', () => {
  const vue = `<template><div /></template>
<script src="/evil.js"></script>`;
  const script = extractScriptSource('clients/web/src/Foo.vue', vue);
  assert.equal(script, '');
});

test('scanFunctionBlocks measures composable bodies', () => {
  const src = `export function useDemo() {
  const a = 1;
  return { a };
}`;
  const blocks = scanFunctionBlocks(src);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lineCount, 4);
});

test('countDeepNestingLines ignores comment-only deep lines', () => {
  const src = `function demo() {
      if (a) {
        // only a comment at deep indent
        return 1;
      }
}`;
  const deep = countDeepNestingLines(src, 4);
  assert.ok(
    !deep.includes(3),
    'comment line must not count as nesting violation',
  );
  assert.ok(deep.includes(5), 'return inside nested block should count');
});

test('evaluateFile enforces strict thresholds for unenrolled post-cutoff files', () => {
  const config = {
    strict: {
      maxFileLines: 400,
      maxFunctionLines: 80,
      maxNestingSpaces: 12,
      maxDeepNestingLines: 0,
    },
    rules: {
      banExplicitAny: true,
      banTsSuppressions: true,
      banConsoleLog: true,
      banTodoWithoutIssue: true,
      banCommentedOutCode: true,
      banInclusiveTerms: true,
      banProcessExit: true,
      requireNamedTimerLiterals: true,
      enforceLayerBoundaries: false,
    },
    processExitAllowPrefixes: [],
    workspaceMergeForbidden: [],
  };

  const content = `export function useBad() {
  const x: any = 1;
  return x;
}`;
  const result = evaluateFile(
    'clients/web/src/composables/useBad.ts',
    content,
    config,
    new Set(['clients/web/src/legacy.ts']),
    { files: {} },
  );
  assert.equal(result.skipped, false);
  assert.ok(result.violations.some((v) => v.rule === 'C9'));
});

test('evaluateFile ratchets enrolled metrics', () => {
  const config = {
    strict: {
      maxFileLines: 400,
      maxFunctionLines: 80,
      maxNestingSpaces: 12,
      maxDeepNestingLines: 0,
    },
    rules: {
      banExplicitAny: false,
      banTsSuppressions: false,
      banConsoleLog: false,
      banTodoWithoutIssue: false,
      banCommentedOutCode: false,
      banInclusiveTerms: false,
      banProcessExit: false,
      requireNamedTimerLiterals: false,
      enforceLayerBoundaries: false,
    },
    processExitAllowPrefixes: [],
    workspaceMergeForbidden: [],
  };

  const rel = 'clients/web/src/composables/useRatchet.ts';
  const content = `${'export const line = 1;\n'.repeat(12)}`;
  const enrollment = {
    files: {
      [rel]: {
        lines: 10,
        longestFunction: 0,
        deepNestingLines: 0,
        maxNestingSpaces: 0,
      },
    },
  };
  const result = evaluateFile(rel, content, config, new Set(), enrollment);
  assert.ok(result.violations.some((v) => v.rule === 'C4'));
});

const RATCHET_CONFIG = {
  strict: {
    maxFileLines: 400,
    maxFunctionLines: 80,
    maxNestingSpaces: 12,
    maxDeepNestingLines: 0,
  },
  rules: {
    banExplicitAny: true,
    banTsSuppressions: false,
    banConsoleLog: false,
    banTodoWithoutIssue: false,
    banCommentedOutCode: false,
    banInclusiveTerms: false,
    banProcessExit: false,
    requireNamedTimerLiterals: false,
    enforceLayerBoundaries: false,
  },
  processExitAllowPrefixes: [],
  workspaceMergeForbidden: [],
};

test('evaluateFile skips grandfathered files without baselines (no strict rules)', () => {
  const rel = 'clients/web/src/legacy.ts';
  const result = evaluateFile(
    rel,
    'export const x: any = 1;\n',
    RATCHET_CONFIG,
    new Set([rel]),
    { files: {} },
  );
  assert.equal(result.skipped, true);
  assert.equal(result.violations.length, 0);
});

test('evaluateFile ratchets grandfathered files against baselines (not strict bans)', () => {
  const rel = 'clients/web/src/legacy.ts';
  const content = `${'export const line = 1;\n'.repeat(12)}export const x: any = 1;\n`;
  const result = evaluateFile(
    rel,
    content,
    RATCHET_CONFIG,
    new Set([rel]),
    { files: {} },
    {
      files: {
        [rel]: {
          lines: 10,
          longestFunction: 0,
          deepNestingLines: 0,
          maxNestingSpaces: 0,
        },
      },
    },
  );
  assert.equal(result.skipped, false);
  assert.equal(result.grandfatherRatchet, true);
  assert.ok(result.violations.some((v) => v.rule === 'C4'));
  assert.ok(
    !result.violations.some((v) => v.rule === 'C9'),
    'grandfather ratchet must not apply ban-any',
  );
});

test('evaluateFile allows grandfathered files within baseline ceilings even with any', () => {
  const rel = 'clients/web/src/legacy.ts';
  const content = 'export const x: any = 1;\n';
  const result = evaluateFile(
    rel,
    content,
    RATCHET_CONFIG,
    new Set([rel]),
    { files: {} },
    {
      files: {
        [rel]: {
          lines: 2,
          longestFunction: 0,
          deepNestingLines: 0,
          maxNestingSpaces: 0,
        },
      },
    },
  );
  assert.equal(result.skipped, false);
  assert.equal(result.violations.length, 0);
});

test('checkNewCodeCharter requires a baseline for existing grandfather paths', () => {
  const rel = 'bot/src/config.ts';
  const result = checkNewCodeCharter({
    scopes: [],
    grandfather: new Set([rel]),
    enrollment: { files: {} },
    grandfatherBaselines: { files: {} },
    skipStaleCheck: true,
    config: {
      scopes: [],
      strict: RATCHET_CONFIG.strict,
      rules: RATCHET_CONFIG.rules,
    },
  });
  assert.ok(result.missingGrandfatherBaselines.includes(rel));
});

test('checkNewCodeCharter ratchets grandfather baselines outside walked scopes', () => {
  const rel = 'bot/src/config.ts';
  const result = checkNewCodeCharter({
    scopes: [],
    grandfather: new Set([rel]),
    enrollment: { files: {} },
    grandfatherBaselines: {
      files: {
        [rel]: {
          lines: 1,
          longestFunction: 0,
          deepNestingLines: 0,
          maxNestingSpaces: 0,
        },
      },
    },
    skipStaleCheck: true,
    config: {
      scopes: [],
      strict: RATCHET_CONFIG.strict,
      rules: RATCHET_CONFIG.rules,
    },
  });
  assert.equal(result.missingGrandfatherBaselines.length, 0);
  const entry = result.violations.find((v) => v.rel === rel);
  assert.ok(entry, 'out-of-scope grandfather baseline must still be checked');
  assert.equal(entry.grandfatherRatchet, true);
  assert.ok(entry.violations.some((v) => v.rule === 'C4'));
});
