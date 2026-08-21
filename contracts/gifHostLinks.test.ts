import { describe, expect, it } from 'vitest';
import {
  gifDisplayUrlFromEmbed,
  isGifHostEmbed,
  isGifHostPageUrl,
  isInlineGifHostEmbed,
  isLikelyGifMediaUrl,
  linkEmbedsExcludingInlineGifs,
} from '@shared/gifHostLinks';
import type { Embed } from '@shared/types';

describe('isLikelyGifMediaUrl', () => {
  it('detects Tenor and Giphy CDN URLs', () => {
    expect(isLikelyGifMediaUrl('https://media.tenor.com/abc/tenor.gif')).toBe(
      true,
    );
    expect(isLikelyGifMediaUrl('https://media.giphy.com/media/x/200.gif')).toBe(
      true,
    );
  });

  it('rejects unrelated hosts', () => {
    expect(isLikelyGifMediaUrl('https://example.com/x.gif')).toBe(true);
    expect(isLikelyGifMediaUrl('https://example.com/x.webp')).toBe(false);
  });
});

describe('isGifHostPageUrl', () => {
  it('detects Tenor and Giphy viewer pages', () => {
    expect(
      isGifHostPageUrl('https://tenor.com/view/happy-cat-gif-1234567890'),
    ).toBe(true);
    expect(isGifHostPageUrl('https://giphy.com/gifs/cat-abc123')).toBe(true);
  });

  it('rejects non-page CDN URLs', () => {
    expect(isGifHostPageUrl('https://media.tenor.com/x/y.gif')).toBe(false);
  });
});

describe('gifDisplayUrlFromEmbed', () => {
  it('prefers embed.image from Discord-synced Tenor rows', () => {
    const embed: Embed = {
      url: 'https://tenor.com/view/cat-gif-123',
      provider: 'Tenor',
      title: 'Cat GIF',
      image: {
        url: 'https://media.tenor.com/abc/tenor.gif',
        width: 498,
        height: 280,
      },
    };
    expect(gifDisplayUrlFromEmbed(embed)).toBe(
      'https://media.tenor.com/abc/tenor.gif',
    );
    expect(isInlineGifHostEmbed(embed)).toBe(true);
  });
});

describe('linkEmbedsExcludingInlineGifs', () => {
  it('keeps non-gif embeds and drops inline gif hosts', () => {
    const tenor: Embed = {
      url: 'https://tenor.com/view/x',
      image: { url: 'https://media.tenor.com/a/b.gif' },
    };
    const youtube: Embed = {
      url: 'https://youtube.com/watch?v=abc',
      title: 'clip',
      video: { kind: 'youtube', embedUrl: 'https://www.youtube.com/embed/abc' },
    };
    expect(linkEmbedsExcludingInlineGifs([tenor, youtube])).toEqual([youtube]);
  });

  it('keeps gif-host embeds without a media URL as link cards', () => {
    const pending: Embed = {
      url: 'https://tenor.com/view/x',
      provider: 'Tenor',
      title: 'GIF',
    };
    expect(isGifHostEmbed(pending)).toBe(true);
    expect(isInlineGifHostEmbed(pending)).toBe(false);
    expect(linkEmbedsExcludingInlineGifs([pending])).toEqual([pending]);
  });
});
