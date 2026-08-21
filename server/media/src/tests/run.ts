import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cacheControlForStorageKey,
  cacheControlForVariant,
} from '../cachePolicy';
import { transformRasterVariant } from '../rasterImageTransform';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

  it('matches backend HLS manifest policy', () => {
    assert.equal(
      cacheControlForStorageKey('echo/channels/c1/u1/hls/master.m3u8'),
      'public, max-age=60, must-revalidate',
    );
  });

  it('matches backend HLS segment policy', () => {
    assert.equal(
      cacheControlForStorageKey('echo/channels/c1/u1/hls/seg-0001.m4s'),
      'public, max-age=31536000, immutable',
    );
    assert.equal(
      cacheControlForStorageKey('echo/channels/c1/u1/hls/seg-0001.ts'),
      'public, max-age=31536000, immutable',
    );
  });
});

describe('media-cdn rasterImageTransform', () => {
  it('resizes and emits webp bytes', async () => {
    const out = await transformRasterVariant(PNG_1X1, {
      width: 64,
      format: 'webp',
    });
    assert.ok(out.length > 0);
    assert.match(out.subarray(0, 4).toString('ascii'), /RIFF/);
  });

  it('extends cache for deterministic variants', () => {
    assert.match(
      cacheControlForVariant('echo/channels/c1/u1/a.png'),
      /max-age=86400/,
    );
  });
});

console.log('media tests: ok');
