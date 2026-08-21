import { describe, expect, it } from 'vitest';
import {
  messagePreviewPlainText,
  truncatePreviewText,
} from '@/features/chat/domain/messagePreviewPlain';

describe('messagePreviewPlainText', () => {
  it('projects v2 JSON and converts custom emoji tokens to shortcodes', () => {
    const plain = messagePreviewPlainText({
      messageFormatVersion: 2,
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'yo ' },
              {
                type: 'customEmoji',
                attrs: {
                  name: 'adel',
                  emojiId: '304238867010606080',
                  animated: false,
                },
              },
            ],
          },
        ],
      },
    });
    expect(plain).toContain(':adel:');
    expect(plain).not.toContain('<:adel:');
  });

  it('truncates after shortcode conversion', () => {
    const out = truncatePreviewText(':wave: hello world', 8);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(8);
  });
});
