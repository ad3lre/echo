import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendMediaCdnVariantParams,
  ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM,
  ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM,
  isRasterImageStorageKey,
  normalizeMediaCdnVariantWidth,
  parseMediaCdnVariantQuery,
} from './mediaCdnVariants';
import { signMediaCdnReadToken } from './mediaCdnSigning';

describe('mediaCdnVariants', () => {
  it('detects raster image storage keys', () => {
    assert.equal(isRasterImageStorageKey('echo/channels/c1/u1/a.png'), true);
    assert.equal(isRasterImageStorageKey('echo/channels/c1/u1/v.mp4'), false);
  });

  it('normalizes allowlisted widths', () => {
    assert.equal(normalizeMediaCdnVariantWidth('640'), 640);
    assert.equal(normalizeMediaCdnVariantWidth(641), null);
  });

  it('parses variant query params', () => {
    assert.deepEqual(parseMediaCdnVariantQuery({ w: '320', f: 'webp' }), {
      width: 320,
      format: 'webp',
    });
    assert.equal(parseMediaCdnVariantQuery({ w: '999' }), null);
  });

  it('appends variant params alongside signed tokens', () => {
    const token = signMediaCdnReadToken(
      'test-media-cdn-signing-secret-32chars',
      'echo/channels/c1/u1/file.png',
    );
    const url = appendMediaCdnVariantParams(
      `https://media.echo.example/v1/o/echo/channels/c1/u1/file.png?t=${encodeURIComponent(token)}`,
      { width: 640, format: 'webp' },
    );
    assert.match(url, /\?.*t=/);
    assert.match(url, new RegExp(`${ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM}=640`));
    assert.match(url, new RegExp(`${ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM}=webp`));
  });
});
