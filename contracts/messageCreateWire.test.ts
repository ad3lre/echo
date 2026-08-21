import { describe, expect, it } from 'vitest';
import { toMessageCreateFanoutPayload } from './messageCreateWire';
import type { Message } from './types/message';

describe('messageCreateWire', () => {
  it('omits TipTap JSON and sets hasContentJson', () => {
    const full: Message = {
      id: 'm1',
      channelId: 'c1',
      authorId: 'u1',
      content: 'hello',
      contentText: 'hello',
      contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentSchemaVersion: 3,
      messageFormatVersion: 2,
      timestamp: '2026-01-01T00:00:00.000Z',
      attachments: [
        {
          url: 'https://cdn.example/a.webp',
          kind: 'image',
        },
      ],
    };
    const slim = toMessageCreateFanoutPayload(full);
    expect(slim.contentJson).toBeUndefined();
    expect(slim.contentSchemaVersion).toBeUndefined();
    expect(slim.hasContentJson).toBe(true);
    expect(slim.contentText).toBe('hello');
    expect(slim.attachments).toEqual(full.attachments);
    expect(slim.messageFormatVersion).toBe(2);
  });

  it('passes through messages without TipTap JSON unchanged', () => {
    const plain: Message = {
      id: 'm2',
      channelId: 'c1',
      authorId: 'u1',
      content: 'hi',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    expect(toMessageCreateFanoutPayload(plain)).toBe(plain);
  });
});
