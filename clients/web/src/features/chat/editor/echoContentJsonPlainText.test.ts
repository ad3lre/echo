import { describe, expect, it } from 'vitest';
import { plainTextFromEchoContentJson } from './echoContentJsonPlainText';

describe('plainTextFromEchoContentJson', () => {
  it('serializes block and inline Echo content nodes', () => {
    expect(
      plainTextFromEchoContentJson({
        type: 'doc',
        content: [
          {
            type: 'heading',
            content: [{ type: 'text', text: 'Project Echo' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'mentionEntity', attrs: { label: 'Ada' } },
              { type: 'text', text: ' check ' },
              { type: 'channelMention', attrs: { label: 'general' } },
              { type: 'hardBreak' },
              {
                type: 'customEmoji',
                attrs: { name: 'wave', emojiId: 'e1', animated: true },
              },
              { type: 'appIcon', attrs: { filename: 'Voice Chat.svg' } },
            ],
          },
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'first' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'const ok = true;' }],
          },
        ],
      }),
    ).toBe(
      'Project Echo\n@Ada check #general\n<a:wave:e1>:voice_chat:\nfirst\nconst ok = true;',
    );
  });

  it('returns empty text for unrecognized roots and malformed nodes', () => {
    expect(plainTextFromEchoContentJson(null)).toBe('');
    expect(plainTextFromEchoContentJson({ type: 'paragraph' })).toBe('');
    expect(
      plainTextFromEchoContentJson({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 123 }] },
          {
            type: 'unknown',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'fallback' }],
              },
            ],
          },
        ],
      }),
    ).toBe('fallback');
  });
});
