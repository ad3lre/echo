import { describe, expect, it } from 'vitest';
import {
  contentWithoutInlineGifHostUrls,
  gifDisplayUrlFromEmbed,
  isGifHostEmbed,
  isGifHostPageUrl,
  isInlineGifHostEmbed,
  isLikelyGifMediaUrl,
  linkEmbedsExcludingInlineGifs,
  normalizeTenorAnimatedGifUrl,
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
    expect(isLikelyGifMediaUrl('https://c.tenor.com/abcAAAAd/x.gif')).toBe(
      true,
    );
  });

  it('rejects unrelated hosts', () => {
    expect(isLikelyGifMediaUrl('https://example.com/x.gif')).toBe(true);
    expect(isLikelyGifMediaUrl('https://example.com/x.webp')).toBe(false);
  });
});

describe('normalizeTenorAnimatedGifUrl', () => {
  it('rewrites Tenor PNG/mp4 CDN URLs to AAAAC.gif', () => {
    expect(
      normalizeTenorAnimatedGifUrl(
        'https://media.tenor.com/LSI81MmB6gEAAAAN/cat-fear.png',
      ),
    ).toBe('https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif');
    expect(
      normalizeTenorAnimatedGifUrl(
        'https://media.tenor.com/LSI81MmB6gEAAAPo/cat-fear.mp4',
      ),
    ).toBe('https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif');
  });

  it('leaves non-Tenor URLs unchanged', () => {
    expect(
      normalizeTenorAnimatedGifUrl('https://media.giphy.com/media/x/giphy.gif'),
    ).toBe('https://media.giphy.com/media/x/giphy.gif');
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
  it('prefers embed.image from Discord-synced Tenor rows and animates it', () => {
    const embed: Embed = {
      url: 'https://tenor.com/view/cat-gif-123',
      provider: 'Tenor',
      title: 'Cat GIF',
      image: {
        url: 'https://media.tenor.com/LSI81MmB6gEAAAAD/cat-fear.png',
        width: 498,
        height: 280,
      },
    };
    expect(gifDisplayUrlFromEmbed(embed)).toBe(
      'https://media.tenor.com/LSI81MmB6gEAAAAC/cat-fear.gif',
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

describe('contentWithoutInlineGifHostUrls', () => {
  it('strips tenor page URLs that already render as inline GIFs', () => {
    const url = 'https://tenor.com/view/cat-gif-123';
    const embeds: Embed[] = [
      {
        url,
        image: { url: 'https://media.tenor.com/LSI81MmB6gEAAAAC/cat.gif' },
      },
    ];
    expect(contentWithoutInlineGifHostUrls(url, embeds)).toBe('');
    expect(contentWithoutInlineGifHostUrls(`lol ${url}`, embeds)).toBe('lol');
  });
});
