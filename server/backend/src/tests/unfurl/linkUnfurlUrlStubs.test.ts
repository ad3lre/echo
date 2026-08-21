/**
 * Run: npx ts-node src/tests/unfurl/linkUnfurlUrlStubs.test.ts
 */
import assert from 'node:assert/strict';
import {
  shouldSkipHttpUnfurlForUrl,
  stubEmbedFromUrlWhenUnfurlFails,
} from '../../services/linkUnfurl/linkUnfurlUrlStubs';

function test(name: string, fn: () => void) {
  try {
    fn();
    // eslint-disable-next-line no-console
    console.log(`ok ${name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('Canva design URL stub includes key and skips HTTP', () => {
  const u = 'https://www.canva.com/design/DAFabc123/edit';
  assert.equal(shouldSkipHttpUnfurlForUrl(u), true);
  const e = stubEmbedFromUrlWhenUnfurlFails(u);
  assert(e);
  assert.equal(e.title, 'Canva design');
  assert.equal(e.provider, 'Canva');
  assert.equal(e.url, u);
  assert(e.description?.includes('DAFabc123'));
});

test('Canva non-design URL stub is generic', () => {
  const u = 'https://canva.com/';
  assert.equal(shouldSkipHttpUnfurlForUrl(u), true);
  const e = stubEmbedFromUrlWhenUnfurlFails(u);
  assert(e);
  assert.equal(e.title, 'Canva');
  assert(!e.description?.includes('Design key:'));
});

test('localhost and unsafe URLs return null stub / no skip', () => {
  assert.equal(
    stubEmbedFromUrlWhenUnfurlFails('http://localhost/canva.com/design/x'),
    null,
  );
  assert.equal(
    shouldSkipHttpUnfurlForUrl('http://localhost/canva.com/design/x'),
    false,
  );
});

test('Figma URL skips HTTP and stub mentions file key', () => {
  const u = 'https://www.figma.com/file/abc123/My-File';
  assert.equal(shouldSkipHttpUnfurlForUrl(u), true);
  const e = stubEmbedFromUrlWhenUnfurlFails(u);
  assert(e);
  assert.equal(e.provider, 'Figma');
  assert(e.description?.includes('abc123'));
});

test('X status URL stub includes status id', () => {
  const u = 'https://x.com/user/status/1709923456789012345';
  assert.equal(shouldSkipHttpUnfurlForUrl(u), true);
  const e = stubEmbedFromUrlWhenUnfurlFails(u);
  assert(e);
  assert.equal(e.provider, 'X');
  assert(e.description?.includes('1709923456789012345'));
});
