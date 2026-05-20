// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  discordCdnCustomEmojiMediaUrl,
  discordCustomEmojiCandidateUrls,
  fallbackDiscordCdnCustomEmojiImageUrl,
  renderCustomEmojiHtml,
  resolveCustomEmojiImageUrlForDisplay,
  safeCustomEmojiUrl,
} from './customEmojiUrl';

describe('customEmojiUrl', () => {
  it('accepts normal custom emoji image URLs', () => {
    expect(safeCustomEmojiUrl('https://cdn.test/emoji.webp')).toBe(
      'https://cdn.test/emoji.webp',
    );
    expect(safeCustomEmojiUrl('//cdn.example.com/emoji.webp')).toBe(
      'https://cdn.example.com/emoji.webp',
    );
    expect(safeCustomEmojiUrl('cdn.example.com/emoji.webp')).toBe(
      'https://cdn.example.com/emoji.webp',
    );
    const rel = safeCustomEmojiUrl('/uploads/emoji.webp');
    expect(rel === '/uploads/emoji.webp' || rel?.endsWith('/uploads/emoji.webp')).toBe(
      true,
    );
    const bare = safeCustomEmojiUrl('emoji.webp');
    expect(bare === '/emoji.webp' || bare?.endsWith('/emoji.webp')).toBe(true);
  });

  it('rejects unsafe data URLs and scriptable schemes', () => {
    expect(safeCustomEmojiUrl('data:image/svg+xml,<svg/>')).toBeNull();
    expect(safeCustomEmojiUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(safeCustomEmojiUrl('javascript:alert(1)')).toBeNull();
    expect(safeCustomEmojiUrl('vbscript:alert(1)')).toBeNull();
  });

  it('accepts raster data URLs (Discord-imported emoji packs)', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(safeCustomEmojiUrl(png)).toBe(png);
    const gif =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    expect(safeCustomEmojiUrl(gif)).toBe(gif);
  });

  it('renders sanitized img html only for safe custom emoji URLs', () => {
    expect(renderCustomEmojiHtml('https://cdn.test/emoji.webp', 'wave')).toBe(
      '<img class="emoji custom-emoji" draggable="false" alt=":wave:" src="https://cdn.test/emoji.webp">',
    );
    expect(
      renderCustomEmojiHtml('data:image/svg+xml,<svg onload=alert(1)>', 'wave'),
    ).toBeNull();
  });

  it('builds Discord CDN emoji URLs for plausible snowflakes', () => {
    expect(discordCdnCustomEmojiMediaUrl('304238867010606080', false)).toBe(
      'https://cdn.discordapp.com/emojis/304238867010606080.png',
    );
    expect(discordCdnCustomEmojiMediaUrl('304238867010606080', true)).toBe(
      'https://cdn.discordapp.com/emojis/304238867010606080.gif',
    );
    const cdn = fallbackDiscordCdnCustomEmojiImageUrl(
      '304238867010606080',
      false,
    );
    expect(cdn).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/emojis\/\d+\.(?:webp|png)$/,
    );
    const candidates = discordCustomEmojiCandidateUrls(
      '304238867010606080',
      false,
    );
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.some((u) => u.includes('media.discordapp.net'))).toBe(
      true,
    );
    expect(fallbackDiscordCdnCustomEmojiImageUrl('12', false)).toBeNull();
    expect(
      fallbackDiscordCdnCustomEmojiImageUrl('notdigits', false),
    ).toBeNull();
  });

  it('rewrites Echo R2 upload URLs for authenticated read-through', () => {
    const r2 =
      'https://bucket.r2.dev/echo/servers/s1/emojis/e1.webp';
    const out = safeCustomEmojiUrl(r2);
    expect(out).toContain('/api/v1/echo/uploads/');
    expect(out).not.toContain('.r2.dev');
  });

  it('resolveCustomEmojiImageUrlForDisplay prefers map then Discord after Echo miss', () => {
    const m = new Map<string, string>([
      ['111111111111111111', 'https://echo.test/e.png'],
    ]);
    expect(
      resolveCustomEmojiImageUrlForDisplay(
        '111111111111111111',
        false,
        m,
        false,
      ),
    ).toBe('https://echo.test/e.png');
    expect(
      resolveCustomEmojiImageUrlForDisplay('304238867010606080', true, m, true),
    ).toMatch(/\.gif$/);
    expect(
      resolveCustomEmojiImageUrlForDisplay(
        '304238867010606080',
        true,
        m,
        false,
      ),
    ).toBeNull();
    expect(
      resolveCustomEmojiImageUrlForDisplay('304238867010606080', false, m, false, {
        allowDiscordCdnGuess: true,
      }),
    ).toMatch(/cdn\.discordapp\.com/);
  });
});
