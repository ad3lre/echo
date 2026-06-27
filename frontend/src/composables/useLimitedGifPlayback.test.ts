import { describe, expect, it, vi, beforeEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { ECHO_MEDIA_CDN_OBJECT_PREFIX } from '@shared/mediaCdn';

const { resolveSignedEchoMediaUrl, echoMediaUrlNeedsSigning } = vi.hoisted(
  () => ({
    resolveSignedEchoMediaUrl: vi.fn(),
    echoMediaUrlNeedsSigning: vi.fn(),
  }),
);

vi.mock('@/services/mediaCdn', () => ({
  resolveSignedEchoMediaUrl,
  echoMediaUrlNeedsSigning,
}));

vi.mock('@/utils/gifFirstFrame', () => ({
  captureImageFirstFrameDataUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/gifOneLoopDuration', () => ({
  fetchGifOneLoopDurationMs: vi.fn().mockResolvedValue(1000),
  gifPlaybackCacheBustUrl: (url: string) => url,
}));

import { useLimitedGifPlayback } from './useLimitedGifPlayback';

describe('useLimitedGifPlayback', () => {
  beforeEach(() => {
    resolveSignedEchoMediaUrl.mockReset();
    echoMediaUrlNeedsSigning.mockReset();
  });

  it('does not assign unsigned media-cdn URLs before signing completes', async () => {
    const unsigned = `https://media.echo.example${ECHO_MEDIA_CDN_OBJECT_PREFIX}echo/avatars/u1/a.webp`;
    const signed = `${unsigned}?t=signed-token`;

    echoMediaUrlNeedsSigning.mockReturnValue(true);
    let resolveSign!: (url: string) => void;
    resolveSignedEchoMediaUrl.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveSign = resolve;
        }),
    );

    const scope = effectScope();
    const { safeUrl } = scope.run(() =>
      useLimitedGifPlayback({
        imageUrl: () => unsigned,
        sessionKey: () => 'u1',
        staticOnly: () => true,
      }),
    )!;

    await nextTick();
    expect(safeUrl.value).toBe('');
    expect(resolveSignedEchoMediaUrl).toHaveBeenCalledWith({
      url: unsigned,
      storageKey: undefined,
    });

    resolveSign(signed);
    await nextTick();
    expect(safeUrl.value).toBe(signed);

    scope.stop();
  });

  it('uses trusted URLs immediately without waiting for signing', async () => {
    const bundled = '/assets/pfp.webp';
    echoMediaUrlNeedsSigning.mockReturnValue(false);

    const scope = effectScope();
    const { safeUrl } = scope.run(() =>
      useLimitedGifPlayback({
        imageUrl: () => bundled,
        sessionKey: () => 'u1',
      }),
    )!;

    await nextTick();
    expect(safeUrl.value).toBe(bundled);
    expect(resolveSignedEchoMediaUrl).not.toHaveBeenCalled();

    scope.stop();
  });
});
