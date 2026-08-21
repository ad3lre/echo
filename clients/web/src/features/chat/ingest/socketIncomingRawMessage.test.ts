import { describe, expect, it } from 'vitest';
import {
  rawMessageFromEchoAckMessage,
  rawMessageFromEchoRealtimeIncomingPayload,
  rawMessageFromSocketChatFields,
} from '@/features/chat/ingest/socketIncomingRawMessage';
import type { Message } from '@shared/types';

describe('rawMessageFromSocketChatFields', () => {
  it('defaults format/schema version and uses contentText when set', () => {
    const r = rawMessageFromSocketChatFields({
      id: '1',
      authorId: 'u',
      content: 'plain',
      contentText: 'text',
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(r.messageFormatVersion).toBe(1);
    expect(r.contentSchemaVersion).toBe(1);
    expect(r.content).toBe('text');
    expect(r.contentText).toBe('text');
  });

  it('includes contentJson when format v2', () => {
    const doc = { type: 'doc' };
    const r = rawMessageFromSocketChatFields({
      id: '1',
      authorId: 'u',
      content: '',
      contentText: 'hi',
      contentJson: doc,
      messageFormatVersion: 2,
      contentSchemaVersion: 3,
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(r.contentJson).toEqual(doc);
    expect(r.messageFormatVersion).toBe(2);
    expect(r.contentSchemaVersion).toBe(3);
  });

  it('trims author display fields', () => {
    const r = rawMessageFromSocketChatFields({
      id: '1',
      authorId: 'u',
      content: 'x',
      authorDisplayName: '  n ',
      authorAvatar: '  a ',
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(r.authorDisplayName).toBe('n');
    expect(r.authorAvatar).toBe('a');
  });
});

describe('rawMessageFromEchoRealtimeIncomingPayload', () => {
  it('uses resolved author over payload authorId', () => {
    const r = rawMessageFromEchoRealtimeIncomingPayload(
      {
        id: 'm',
        channelId: 'c',
        authorId: 'wrong',
        content: 'hi',
        timestamp: '2020-01-01T00:00:00.000Z',
      },
      'right',
    );
    expect(r.authorId).toBe('right');
  });
});

describe('rawMessageFromEchoAckMessage', () => {
  it('maps Message to RawMessage including editedAt', () => {
    const m = {
      id: 'm1',
      channelId: 'c1',
      authorId: 'u1',
      content: 'c',
      timestamp: '2020-01-01T00:00:00.000Z',
      editedAt: '2020-01-02T00:00:00.000Z',
    } satisfies Message;
    const r = rawMessageFromEchoAckMessage(m);
    expect(r.id).toBe('m1');
    expect(r.editedAt).toBeDefined();
  });
});
