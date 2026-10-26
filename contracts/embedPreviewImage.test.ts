import { describe, expect, it } from 'vitest';
import {
  isLikelyVideoFileUrl,
  resolveEmbedCardPreviewImage,
} from './embedPreviewImage';

describe('isLikelyVideoFileUrl', () => {
  it('detects common video extensions including query strings', () => {
    expect(isLikelyVideoFileUrl('https://cdn.discordapp.com/video.mp4')).toBe(
      true,
    );
    expect(
      isLikelyVideoFileUrl(
        'https://cdn.discordapp.com/a.mp4?ex=1&is=2&hm=dead',
      ),
    ).toBe(true);
    expect(isLikelyVideoFileUrl('https://cdn.example.com/x.webm')).toBe(true);
  });

  it('rejects raster and empty URLs', () => {
    expect(isLikelyVideoFileUrl('https://cdn.example.com/x.gif')).toBe(false);
    expect(isLikelyVideoFileUrl('https://cdn.example.com/x.png')).toBe(false);
    expect(isLikelyVideoFileUrl('')).toBe(false);
    expect(isLikelyVideoFileUrl(null)).toBe(false);
  });
});

describe('resolveEmbedCardPreviewImage', () => {
  it('uses image when it is a raster URL', () => {
    expect(
      resolveEmbedCardPreviewImage({
        image: {
          url: 'https://cdn.example.com/clip.gif',
          width: 100,
          height: 50,
        },
      }),
    ).toEqual({
      url: 'https://cdn.example.com/clip.gif',
      width: 100,
      height: 50,
    });
  });

  it('falls back to thumbnail when image is an mp4 (Discord gifv)', () => {
    expect(
      resolveEmbedCardPreviewImage({
        image: {
          url: 'https://cdn.discordapp.com/attachments/1/2/clippy.mp4',
          width: 480,
          height: 270,
        },
        thumbnail: {
          url: 'https://cdn.discordapp.com/attachments/1/2/clippy.webp',
          width: 480,
          height: 270,
        },
      }),
    ).toEqual({
      url: 'https://cdn.discordapp.com/attachments/1/2/clippy.webp',
      width: 480,
      height: 270,
    });
  });

  it('returns undefined when only a video URL is available', () => {
    expect(
      resolveEmbedCardPreviewImage({
        image: { url: 'https://cdn.discordapp.com/video.mp4' },
      }),
    ).toBeUndefined();
  });
});
