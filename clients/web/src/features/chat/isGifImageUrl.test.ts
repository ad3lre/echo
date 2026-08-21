import { describe, expect, it } from 'vitest';
import { isLikelyGifImageUrl } from '@/features/chat/isGifImageUrl';

describe('isLikelyGifImageUrl', () => {
  it('detects data URLs and path suffix', () => {
    expect(isLikelyGifImageUrl('data:image/gif;base64,abc')).toBe(true);
    expect(isLikelyGifImageUrl('https://cdn.example.com/x.gif')).toBe(true);
    expect(isLikelyGifImageUrl('https://cdn.example.com/x.gif?v=1')).toBe(true);
    expect(isLikelyGifImageUrl('https://media.giphy.com/foo')).toBe(true);
    expect(isLikelyGifImageUrl('https://example.com/media.giphy.com/foo')).toBe(
      false,
    );
  });

  it('rejects non-gif', () => {
    expect(isLikelyGifImageUrl('')).toBe(false);
    expect(isLikelyGifImageUrl('https://cdn.example.com/x.webp')).toBe(false);
    expect(isLikelyGifImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  it('detects compact animated asset URLs (a_ hash)', () => {
    expect(
      isLikelyGifImageUrl(
        'https://cdn.discordapp.com/avatars/123/a_abc123def.gif?size=256',
      ),
    ).toBe(true);
    expect(
      isLikelyGifImageUrl(
        'https://media.discordapp.net/banners/456/a_hash.webp?size=600',
      ),
    ).toBe(true);
  });

  it('detects Tenor hosts', () => {
    expect(isLikelyGifImageUrl('https://media.tenor.com/foo/bar.gif')).toBe(
      true,
    );
  });
});
