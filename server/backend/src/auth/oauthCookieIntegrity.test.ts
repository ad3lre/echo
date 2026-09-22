import assert from 'node:assert/strict';
import {
  oauthCookieIntegrityTag,
  oauthCookieIntegrityTagsEqual,
} from './oauthCookieIntegrity';

const secret = 'test-only-master-secret-with-enough-entropy';
const payload = 'provider=discord&state=state-123';
const tag = oauthCookieIntegrityTag(secret, payload);

assert.equal(tag.length, 64);
assert.equal(oauthCookieIntegrityTagsEqual(tag, tag), true);
assert.equal(
  oauthCookieIntegrityTagsEqual(
    tag,
    oauthCookieIntegrityTag(secret, `${payload}-tampered`),
  ),
  false,
);
assert.notEqual(
  tag,
  oauthCookieIntegrityTag('different-master-secret', payload),
);

// eslint-disable-next-line no-console
console.log('oauthCookieIntegrity.test: ok');
