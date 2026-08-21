import { describe, expect, it } from 'vitest';
import {
  consumeAuthorForPendingClientMessage,
  dropPendingClientMessageByClientId,
  dropPendingClientMessageIfChannelAndId,
  isPendingClientMessageId,
  PENDING_CLIENT_MESSAGE_MAX_AGE_MS,
  prunePendingClientMessages,
  recordPendingClientMessage,
  type PendingClientEchoMessage,
} from '@/features/chat/ingest/socketPendingClientMessages';

describe('socketPendingClientMessages', () => {
  it('prunes stale entries', () => {
    const list: PendingClientEchoMessage[] = [
      {
        channelId: 'c1',
        clientMessageId: 'm1',
        authorId: 'u1',
        createdAtMs: 1000,
      },
    ];
    prunePendingClientMessages(
      list,
      1000 + PENDING_CLIENT_MESSAGE_MAX_AGE_MS + 1,
    );
    expect(list).toHaveLength(0);
  });

  it('record then consume returns author', () => {
    const list: PendingClientEchoMessage[] = [];
    recordPendingClientMessage(
      list,
      {
        channelId: 'c1',
        clientMessageId: 'tmp',
        authorId: 'real',
      },
      5000,
    );
    expect(
      consumeAuthorForPendingClientMessage(list, 'c1', 'tmp', 'wrong', 5001),
    ).toBe('real');
    expect(list).toHaveLength(0);
  });

  it('consume with no match returns fallback', () => {
    const list: PendingClientEchoMessage[] = [];
    expect(consumeAuthorForPendingClientMessage(list, 'c', 'x', 'fb', 1)).toBe(
      'fb',
    );
  });

  it('dropPendingClientMessageByClientId', () => {
    const list: PendingClientEchoMessage[] = [
      {
        channelId: 'c',
        clientMessageId: 'x',
        authorId: 'u',
        createdAtMs: 1,
      },
    ];
    dropPendingClientMessageByClientId(list, 'x');
    expect(list).toHaveLength(0);
  });

  it('isPendingClientMessageId matches channel and id', () => {
    const list: PendingClientEchoMessage[] = [];
    recordPendingClientMessage(
      list,
      {
        channelId: 'c1',
        clientMessageId: 'pending-mid',
        authorId: 'u1',
      },
      10_000,
    );
    expect(isPendingClientMessageId(list, 'c1', 'pending-mid', 10_001)).toBe(
      true,
    );
    expect(isPendingClientMessageId(list, 'c2', 'pending-mid', 10_001)).toBe(
      false,
    );
  });

  it('dropPendingClientMessageIfChannelAndId', () => {
    const list: PendingClientEchoMessage[] = [
      {
        channelId: 'c1',
        clientMessageId: 'x',
        authorId: 'u',
        createdAtMs: 1,
      },
      {
        channelId: 'c2',
        clientMessageId: 'x',
        authorId: 'u',
        createdAtMs: 1,
      },
    ];
    dropPendingClientMessageIfChannelAndId(list, 'c1', 'x');
    expect(list).toHaveLength(1);
    expect(list[0]!.channelId).toBe('c2');
  });
});
