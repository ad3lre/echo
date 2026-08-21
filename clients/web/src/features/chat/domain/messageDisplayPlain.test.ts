import { describe, expect, it } from 'vitest';
import {
  plainTextForEchoApiMessage,
  plainTextForMessageFields,
} from '@/features/chat/domain/messageDisplayPlain';

describe('plainTextForMessageFields', () => {
  it('prefers longer TipTap JSON plain over short legacy content column', () => {
    const plain = plainTextForMessageFields({
      content: 'second line only',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'first line' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'second line only' }],
          },
        ],
      },
      messageFormatVersion: 2,
    });
    expect(plain).toContain('first line');
    expect(plain).toContain('second line only');
  });

  it('uses searchIndexText from API-shaped rows when contentText absent', () => {
    const plain = plainTextForEchoApiMessage({
      id: '1',
      channelId: 'c',
      authorId: 'a',
      content: 'short',
      searchIndexText: 'full body from search index',
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(plain).toBe('full body from search index');
  });
});
