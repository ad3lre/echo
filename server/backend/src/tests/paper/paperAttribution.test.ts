/**
 * Run: node --import tsx server/backend/src/tests/paper/paperAttribution.test.ts
 */
import assert from 'node:assert/strict';
import { applyPaperAttributionStamp } from '../../domain/paperAttribution';

function para(
  id: string,
  text: string,
  attrs?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'paragraph',
    attrs: { paperBlockId: id, ...attrs },
    content: [{ type: 'text', text }],
  };
}

function doc(...blocks: Record<string, unknown>[]): Record<string, unknown> {
  return { type: 'doc', content: blocks };
}

function blockAttrs(
  out: Record<string, unknown>,
  index = 0,
): Record<string, unknown> {
  return (out.content as Record<string, unknown>[])[index]!.attrs as Record<
    string,
    unknown
  >;
}

function testNewBlockStampsAuthorOnly(): void {
  const out = applyPaperAttributionStamp(
    null,
    doc(para('b1', 'hello')),
    'user-a',
  );
  const attrs = blockAttrs(out);
  assert.equal(attrs.authorId, 'user-a');
  assert.equal(attrs.coAuthorIds, undefined);
}

function testPreservesAttributionWhenFingerprintUnchanged(): void {
  const prev = applyPaperAttributionStamp(
    null,
    doc(para('b1', 'hello')),
    'user-a',
  );
  const prevBlock = (prev.content as Record<string, unknown>[])[0]!;
  const out = applyPaperAttributionStamp(
    prev,
    doc(structuredClone(prevBlock)),
    'user-b',
  );
  const attrs = blockAttrs(out);
  assert.equal(attrs.authorId, 'user-a');
  assert.equal(attrs.coAuthorIds, undefined);
}

function testSharedCreditOnDifferentUserEdit(): void {
  const prev = applyPaperAttributionStamp(
    null,
    doc(para('b1', 'hello')),
    'user-a',
  );
  const out = applyPaperAttributionStamp(
    prev,
    doc(para('b1', 'hello world')),
    'user-b',
  );
  const attrs = blockAttrs(out);
  assert.equal(attrs.authorId, 'user-b');
  assert.deepEqual(attrs.coAuthorIds, ['user-a', 'user-b']);
}

function testClearsCoAuthorsWhenSameUserEditsAgain(): void {
  const prevOnce = applyPaperAttributionStamp(
    null,
    doc(para('b1', 'v1')),
    'user-a',
  );
  const prev = applyPaperAttributionStamp(
    prevOnce,
    doc(para('b1', 'v2')),
    'user-b',
  );
  const out = applyPaperAttributionStamp(prev, doc(para('b1', 'v3')), 'user-a');
  const attrs = blockAttrs(out);
  assert.equal(attrs.authorId, 'user-a');
  assert.equal(attrs.coAuthorIds, undefined);
}

function testPreservesCoAuthorsOnUnchangedFingerprint(): void {
  const prevOnce = applyPaperAttributionStamp(
    null,
    doc(para('b1', 'shared')),
    'user-a',
  );
  const prev = applyPaperAttributionStamp(
    prevOnce,
    doc(para('b1', 'shared edit')),
    'user-b',
  );
  const prevBlock = (prev.content as Record<string, unknown>[])[0]!;
  const out = applyPaperAttributionStamp(
    prev,
    doc(structuredClone(prevBlock)),
    'user-c',
  );
  const attrs = blockAttrs(out);
  assert.equal(attrs.authorId, 'user-b');
  assert.deepEqual(attrs.coAuthorIds, ['user-a', 'user-b']);
}

function run(): void {
  testNewBlockStampsAuthorOnly();
  testPreservesAttributionWhenFingerprintUnchanged();
  testSharedCreditOnDifferentUserEdit();
  testClearsCoAuthorsWhenSameUserEditsAgain();
  testPreservesCoAuthorsOnUnchangedFingerprint();
  console.log('paperAttribution.test.ts: ok');
}

run();
