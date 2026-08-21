import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { appleIdTokenNonceMatches } from './appleOidc.ts';

describe('appleIdTokenNonceMatches', () => {
  it('accepts SHA-256 hex digest of the raw client nonce', () => {
    const raw = 'raw-client-nonce-value-32chars!!';
    const hex = createHash('sha256').update(raw, 'utf8').digest('hex');
    assert.equal(appleIdTokenNonceMatches(hex, raw), true);
  });

  it('accepts SHA-256 base64url digest of the raw client nonce', () => {
    const raw = 'another-raw-nonce-for-apple-siwa';
    const b64 = createHash('sha256').update(raw, 'utf8').digest('base64url');
    assert.equal(appleIdTokenNonceMatches(b64, raw), true);
  });

  it('accepts an already-hashed expected nonce (exact claim match)', () => {
    const digest = createHash('sha256').update('x', 'utf8').digest('hex');
    assert.equal(appleIdTokenNonceMatches(digest, digest), true);
  });

  it('rejects mismatched nonces', () => {
    const raw = 'expected-raw-nonce';
    const other = createHash('sha256').update('other', 'utf8').digest('hex');
    assert.equal(appleIdTokenNonceMatches(other, raw), false);
    assert.equal(appleIdTokenNonceMatches('', raw), false);
  });
});
