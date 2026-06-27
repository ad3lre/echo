import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cacheControlForStorageKey } from '../cachePolicy';

describe('media-cdn cachePolicy', () => {
  it('marks branding keys immutable', () => {
    assert.match(
      cacheControlForStorageKey('echo/server-icons/s1/u1/icon.png'),
      /immutable/,
    );
  });

  it('uses private cache for chat uploads', () => {
    assert.match(
      cacheControlForStorageKey('echo/channels/c1/u1/a.png'),
      /^private/,
    );
  });
});

console.log('media-cdn tests: ok');
