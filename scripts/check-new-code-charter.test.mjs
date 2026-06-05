import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countDeepNestingLines,
  evaluateFile,
  extractScriptSource,
  isTestPath,
  scanFunctionBlocks,
} from './check-new-code-charter.mjs';

test('isTestPath skips test fixtures', () => {
  assert.equal(isTestPath('frontend/src/foo.test.ts'), true);
  assert.equal(isTestPath('frontend/src/__tests__/bar.ts'), true);
  assert.equal(isTestPath('frontend/src/components/Foo.vue'), false);
});

test('extractScriptSource reads vue script blocks', () => {
  const vue = `<template><div /></template>
<script setup lang="ts">
const x = 1;
</script>`;
  assert.match(extractScriptSource('frontend/src/Foo.vue', vue), /const x = 1/);
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
    'frontend/src/composables/useBad.ts',
    content,
    config,
    new Set(['frontend/src/legacy.ts']),
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

  const rel = 'frontend/src/composables/useRatchet.ts';
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
