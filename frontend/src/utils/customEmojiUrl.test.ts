// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderCustomEmojiHtml, safeCustomEmojiUrl } from './customEmojiUrl';

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
    expect(safeCustomEmojiUrl('/uploads/emoji.webp')).toBe(
      '/uploads/emoji.webp',
    );
    expect(safeCustomEmojiUrl('emoji.webp')).toBe('/emoji.webp');
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
});
