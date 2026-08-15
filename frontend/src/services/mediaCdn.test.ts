import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  clearEchoMediaCdnSignedUrlCacheForTests,
  echoMediaUrlNeedsSigning,
  isEchoMediaCdnCanonicalUrl,
  resolveSignedEchoMediaUrl,
} from './mediaCdn';
import { ECHO_MEDIA_CDN_OBJECT_PREFIX } from '@shared/mediaCdn';

vi.mock('@/api/echo/transport', () => ({
  echoFetch: vi.fn(),
}));

import { echoFetch } from '@/api/echo/transport';

describe('mediaCdn service', () => {
  beforeEach(() => {
    clearEchoMediaCdnSignedUrlCacheForTests();
    vi.mocked(echoFetch).mockReset();
  });

  it('detects canonical media CDN object URLs', () => {
    const url = `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/channels/c1/u1/a.png`;
    expect(isEchoMediaCdnCanonicalUrl(url)).toBe(true);
    expect(echoMediaUrlNeedsSigning(url)).toBe(true);
  });

  it('skips URLs that already include a token', () => {
    const url = `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/channels/c1/u1/a.png?t=abc`;
    expect(echoMediaUrlNeedsSigning(url)).toBe(false);
  });

  it('falls back to API read-through when signing fails', async () => {
    vi.mocked(echoFetch).mockRejectedValue(new Error('network'));
    const unsigned = `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/avatars/u1/a.webp`;
    const resolved = await resolveSignedEchoMediaUrl({ url: unsigned });
    expect(resolved).toContain(
      '/api/v1/echo/uploads/s3/echo/avatars/u1/a.webp',
    );
    expect(resolved).not.toBe(unsigned);
  });

  it('coalesces concurrent signing requests for the same object', async () => {
    const unsigned = `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/avatars/u1/a.webp`;
    vi.mocked(echoFetch).mockResolvedValue({
      urls: [
        {
          storageKey: 'echo/avatars/u1/a.webp',
          url: `${unsigned}?t=signed`,
          expiresAt: Date.now() + 3_600_000,
          scope: 'object',
        },
      ],
    });

    const resolved = await Promise.all([
      resolveSignedEchoMediaUrl({ url: unsigned }),
      resolveSignedEchoMediaUrl({ url: unsigned }),
    ]);

    expect(echoFetch).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual([`${unsigned}?t=signed`, `${unsigned}?t=signed`]);
  });
});
