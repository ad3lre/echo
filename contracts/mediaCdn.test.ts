import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMediaCdnObjectUrl,
  ECHO_MEDIA_CDN_OBJECT_PREFIX,
  extractStorageKeyFromMediaCdnUrl,
} from './mediaCdn';
import {
  signMediaCdnReadToken,
  verifyMediaCdnReadToken,
} from './mediaCdnSigning';

const SECRET = 'test-media-cdn-signing-secret-32chars';

describe('mediaCdn', () => {
  it('builds canonical object URLs without embedded tokens', () => {
    const url = buildMediaCdnObjectUrl(
      'https://media.echo.example',
      'echo/channels/c1/u1/file.png',
    );
    assert.equal(
      url,
      `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/channels/c1/u1/file.png`,
    );
  });

  it('appends signed token query param when provided', () => {
    const token = signMediaCdnReadToken(SECRET, 'echo/channels/c1/u1/file.png');
    const url = buildMediaCdnObjectUrl(
      'https://media.echo.example',
      'echo/channels/c1/u1/file.png',
      token,
    );
    assert.match(url, /\?t=/);
    assert.equal(
      verifyMediaCdnReadToken(SECRET, token, 'echo/channels/c1/u1/file.png'),
      true,
    );
  });

  it('supports prefix scope for HLS segment paths', () => {
    const sourceKey = 'echo/channels/c1/u1/video.mp4';
    const token = signMediaCdnReadToken(SECRET, `${sourceKey}/hls`, {
      scope: 'prefix',
    });
    assert.equal(
      verifyMediaCdnReadToken(SECRET, token, `${sourceKey}/hls/master.m3u8`),
      true,
    );
    assert.equal(
      verifyMediaCdnReadToken(SECRET, token, `${sourceKey}/hls/seg-0001.m4s`),
      true,
    );
    assert.equal(
      verifyMediaCdnReadToken(SECRET, token, 'echo/channels/c1/u1/other.mp4'),
      false,
    );
  });

  it('rejects public audience for private keys', () => {
    assert.throws(() =>
      signMediaCdnReadToken(SECRET, 'echo/channels/c1/u1/file.png', {
        aud: 'public',
      }),
    );
  });

  it('allows public audience for branding keys', () => {
    const key = 'echo/server-icons/s1/u1/icon.png';
    const token = signMediaCdnReadToken(SECRET, key, { aud: 'public' });
    assert.equal(verifyMediaCdnReadToken(SECRET, token, key), true);
  });

  it('extracts storage keys from media CDN URLs', () => {
    const url = buildMediaCdnObjectUrl(
      'https://media.echo.example',
      'echo/public-emojis/123.webp',
    );
    assert.equal(
      extractStorageKeyFromMediaCdnUrl(url, {
        httpMediaCdnBaseUrls: ['https://media.echo.example'],
      }),
      'echo/public-emojis/123.webp',
    );
  });
});
