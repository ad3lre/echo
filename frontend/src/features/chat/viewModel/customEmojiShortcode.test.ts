// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/composables/useMarkdown';
import {
  resolveCustomEmojiImageUrlForDisplay,
  shouldAllowDiscordCdnGuessForEmojiId,
} from '@/utils/customEmojiUrl';

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
    expect(out).toMatch(/class="emoji custom-emoji/);
    expect(out).toContain('https://cdn.test/adel.webp');
    expect(out).not.toContain('>hello :adel: there<');
  });

  it('re-parses shortcode when resolver version bumps (async emoji URL resolve)', () => {
    const input = 'hey :cheese:';
    const byName = new Map([
      ['cheese', { id: '304238867010606081', name: 'cheese', animated: false }],
    ]);

    const v0 = parseMessageContent(input, undefined, {
      _cacheVersion: 0,
      customEmojiByName: byName,
      customEmojiImageUrl: () => undefined,
    });
    expect(v0).toContain('custom-emoji-skeleton');
    expect(v0).toContain('custom-emoji-inline--pending');

    const v1 = parseMessageContent(input, undefined, {
      _cacheVersion: 1,
      customEmojiByName: byName,
      customEmojiImageUrl: (id) =>
        id === '304238867010606081'
          ? 'https://cdn.test/cheese.webp'
          : undefined,
    });
    expect(v1).toMatch(/class="emoji custom-emoji/);
    expect(v1).toContain('https://cdn.test/cheese.webp');
  });

  it('renders cross-server custom emoji token via optimistic Discord CDN guess', () => {
    const id = '304238867010606080';
    const out = parseMessageContent(`hi <:adel:${id}> there`, undefined, {
      _cacheVersion: 1,
      customEmojiImageUrl: (emojiId) =>
        resolveCustomEmojiImageUrlForDisplay(emojiId, false, new Map(), false, {
          allowDiscordCdnGuess: shouldAllowDiscordCdnGuessForEmojiId(
            emojiId,
            new Map(),
            false,
          ),
        }) ?? undefined,
    });
    expect(out).toMatch(/class="emoji custom-emoji/);
    expect(out).toContain(`cdn.discordapp.com/emojis/${id}`);
    expect(out).not.toMatch(/>[^<]*:adel:[^<]*</);
  });
});
