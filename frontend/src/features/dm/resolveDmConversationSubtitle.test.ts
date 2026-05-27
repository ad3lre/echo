import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  formatDmTypingSubtitle,
  peerDmChannelIds,
  resolveDmConversationSubtitle,
} from '@/features/dm/resolveDmConversationSubtitle';

function msg(
  partial: Partial<RawMessage> &
    Pick<RawMessage, 'id' | 'authorId' | 'content'>,
): RawMessage {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as RawMessage;
}

describe('resolveDmConversationSubtitle', () => {
  it('prefers typing over last message for a direct thread', () => {
    const peerMap = new Map([['snow-1', 'peer-a']]);
    const messages: Record<string, RawMessage[]> = {
      'snow-1': [
        msg({
          id: 'm1',
          authorId: 'peer-a',
          content: 'hey there',
          timestamp: '2026-01-02T00:00:00.000Z',
        }),
      ],
    };
    const result = resolveDmConversationSubtitle({
      kind: 'user',
      peerUserId: 'peer-a',
      selfId: 'self',
      echoPeerByChannelId: peerMap,
      getMessages: (ch) => messages[ch],
      typersFor: (ch) =>
        ch === 'snow-1' ? [{ userId: 'peer-a', displayName: 'Alice' }] : [],
    });
    expect(result).toEqual({ text: 'Writing to you…', isTyping: true });
  });

  it('shows last message with You prefix for self-authored direct messages', () => {
    const peerMap = new Map<string, string>();
    const messages: Record<string, RawMessage[]> = {
      'dm-peer-a': [
        msg({
          id: 'm1',
          authorId: 'self',
          content: 'saved note',
          timestamp: '2026-01-02T00:00:00.000Z',
        }),
      ],
    };
    const result = resolveDmConversationSubtitle({
      kind: 'user',
      peerUserId: 'peer-a',
      selfId: 'self',
      echoPeerByChannelId: peerMap,
      getMessages: (ch) => messages[ch],
      typersFor: () => [],
    });
    expect(result).toEqual({ text: 'You: saved note', isTyping: false });
  });

  it('shows author prefix for group last messages', () => {
    const messages: Record<string, RawMessage[]> = {
      'dm-group-1': [
        msg({
          id: 'm1',
          authorId: 'u2',
          content: 'brb',
          timestamp: '2026-01-02T00:00:00.000Z',
        }),
      ],
    };
    const result = resolveDmConversationSubtitle({
      kind: 'group',
      groupChannelId: 'dm-group-1',
      selfId: 'self',
      echoPeerByChannelId: new Map(),
      getMessages: (ch) => messages[ch],
      typersFor: () => [],
      resolveAuthorName: (id) => (id === 'u2' ? 'Bob' : 'Someone'),
    });
    expect(result).toEqual({ text: 'Bob: brb', isTyping: false });
  });
});

describe('formatDmTypingSubtitle', () => {
  it('uses group copy for multiple typers', () => {
    expect(
      formatDmTypingSubtitle({
        isDirect: false,
        typers: [
          { userId: 'a', displayName: 'A' },
          { userId: 'b', displayName: 'B' },
        ],
      }),
    ).toBe('A and B are typing…');
  });
});

describe('peerDmChannelIds', () => {
  it('includes echo and legacy ids', () => {
    expect(peerDmChannelIds('peer-a', new Map([['snow-1', 'peer-a']]))).toEqual(
      ['snow-1', 'dm-peer-a'],
    );
  });
});
