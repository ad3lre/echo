import { describe, expect, it } from 'vitest';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { buildMessageListRowPresentations } from './messageListRowPresentation';

function row(
  partial: Partial<MessageWithAuthor> &
    Pick<MessageWithAuthor, 'id' | 'authorId'>,
): MessageWithAuthor {
  return {
    id: partial.id,
    authorId: partial.authorId,
    channelId: partial.channelId ?? 'c1',
    content: partial.content ?? '',
    timestamp: partial.timestamp ?? new Date().toISOString(),
    author: partial.author ?? { id: partial.authorId, name: 'u', avatar: '' },
    systemMessage: partial.systemMessage,
  } as MessageWithAuthor;
}

function toRaw(message: MessageWithAuthor): RawMessage {
  return {
    id: message.id,
    authorId: message.authorId,
    timestamp: message.timestamp,
    content: message.content,
    systemMessage: message.systemMessage,
  };
}

describe('buildMessageListRowPresentations', () => {
  it('marks the first unread boundary from the authoritative unread boundary', () => {
    const first = row({
      id: '1492135200000000001',
      authorId: 'a',
      timestamp: '2026-04-10T12:00:00.000Z',
    });
    const second = row({
      id: '1492135200000000002',
      authorId: 'b',
      timestamp: '2026-04-10T12:01:00.000Z',
    });
    const third = row({
      id: '1492135200000000003',
      authorId: 'c',
      timestamp: '2026-04-10T12:02:00.000Z',
    });

    const orderedIds = [first.id!, second.id!, third.id!];
    const messages = new Map<string, MessageWithAuthor>([
      [first.id!, first],
      [second.id!, second],
      [third.id!, third],
    ]);
    const entitiesById = new Map<string, RawMessage>([
      [first.id!, toRaw(first)],
      [second.id!, toRaw(second)],
      [third.id!, toRaw(third)],
    ]);

    const rows = buildMessageListRowPresentations(
      orderedIds,
      messages,
      entitiesById,
      false,
      second.id,
    );

    expect(rows[0]?.readState).toBe('read');
    expect(rows[1]?.readState).toBe('unread');
    expect(rows[1]?.showUnreadSeparatorBefore).toBe(true);
    expect(rows[2]?.showUnreadSeparatorBefore).toBe(false);
  });

  it('does not show the unread separator strip when showUnreadSeparator is false', () => {
    const first = row({
      id: '1492135200000000001',
      authorId: 'a',
      timestamp: '2026-04-10T12:00:00.000Z',
    });
    const second = row({
      id: '1492135200000000002',
      authorId: 'b',
      timestamp: '2026-04-10T12:01:00.000Z',
    });

    const orderedIds = [first.id!, second.id!];
    const messages = new Map<string, MessageWithAuthor>([
      [first.id!, first],
      [second.id!, second],
    ]);
    const entitiesById = new Map<string, RawMessage>([
      [first.id!, toRaw(first)],
      [second.id!, toRaw(second)],
    ]);

    const rows = buildMessageListRowPresentations(
      orderedIds,
      messages,
      entitiesById,
      false,
      second.id,
      undefined,
      false,
    );

    expect(rows[1]?.readState).toBe('unread');
    expect(rows[1]?.showUnreadSeparatorBefore).toBe(false);
  });

  it('uses last-read chronological order so there is only one read→unread transition when ids and time disagree', () => {
    const older = row({
      id: '1492135200000000300',
      authorId: 'a',
      timestamp: '2026-04-05T12:00:00.000Z',
    });
    const newerButLowerId = row({
      id: '1492135200000000100',
      authorId: 'b',
      timestamp: '2026-04-07T12:00:00.000Z',
    });
    const newest = row({
      id: '1492135200000000200',
      authorId: 'c',
      timestamp: '2026-04-09T12:00:00.000Z',
    });

    const orderedIds = [older.id!, newerButLowerId.id!, newest.id!];
    const messages = new Map<string, MessageWithAuthor>([
      [older.id!, older],
      [newerButLowerId.id!, newerButLowerId],
      [newest.id!, newest],
    ]);
    const entitiesById = new Map<string, RawMessage>([
      [older.id!, toRaw(older)],
      [newerButLowerId.id!, toRaw(newerButLowerId)],
      [newest.id!, toRaw(newest)],
    ]);

    const rows = buildMessageListRowPresentations(
      orderedIds,
      messages,
      entitiesById,
      false,
      older.id,
      older.id,
    );

    const sepCount = rows.filter((r) => r.showUnreadSeparatorBefore).length;
    expect(sepCount).toBe(1);
    expect(rows[0]?.readState).toBe('read');
    expect(rows[1]?.readState).toBe('unread');
    expect(rows[2]?.readState).toBe('unread');
  });
});
