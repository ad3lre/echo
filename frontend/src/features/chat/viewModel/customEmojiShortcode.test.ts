// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/composables/useMarkdown';

describe('custom emoji shortcodes in messages', () => {
  it('expands :name: to img when customEmojiByName is provided', () => {
    const out = parseMessageContent('hello :adel: there', undefined, {
      _cacheVersion: 1,
      customEmojiByName: new Map([
        ['adel', { id: '304238867010606080', name: 'adel', animated: false }],
      ]),
      customEmojiImageUrl: (id) =>
        id === '304238867010606080' ? 'https://cdn.test/adel.webp' : undefined,
    });
    expect(out).toContain('class="emoji custom-emoji"');
    expect(out).toContain('https://cdn.test/adel.webp');
    expect(out).not.toContain('>hello :adel: there<');
  });
});
