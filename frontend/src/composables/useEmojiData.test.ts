import { describe, it, expect } from 'vitest';
import { parseEmoji, buildCategories, isSafeHtml } from './useEmojiData';

describe('useEmojiData', () => {
  it('parseEmoji returns an img tag for known emoji', () => {
    const out = parseEmoji('😀');
    expect(out).toContain('class="emoji"');
    expect(out).toContain('alt="😀"');
    expect(out).toMatch(/twemoji\/[0-9a-fA-F]+\.webp/);
  });

  it('isSafeHtml accepts parsed twemoji html', () => {
    const html = parseEmoji('😀');
    expect(isSafeHtml(html)).toBe(true);
    expect(isSafeHtml('<script>alert(1)</script>')).toBe(false);
  });

  it('buildCategories builds categories with html fields', () => {
    const raw = [
      {
        name: 'Smileys & Emotion',
        slug: 'smileys',
        emojis: [
          { emoji: '😀', skin_tone_support: false, name: 'grin', slug: 'grin' },
        ],
      },
    ];
    const cats = buildCategories(raw as any);
    expect(Array.isArray(cats)).toBe(true);
    expect(cats[0].emojis[0].html).toContain('class="emoji"');
  });
});
