import { describe, expect, it } from 'vitest';
import {
  isMessageGroupedWithPrevious,
  sameLocalCalendarMinute,
} from './messageListGrouping';
import type { MessageWithAuthor } from '@shared/types';

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
    replyTo: partial.replyTo,
  } as MessageWithAuthor;
}

describe('sameLocalCalendarMinute', () => {
  it('returns true for same local minute', () => {
    expect(
      sameLocalCalendarMinute(
        '2026-04-10T14:01:00.000Z',
        '2026-04-10T14:01:59.999Z',
      ),
    ).toBe(true);
  });

  it('returns false across minute boundary', () => {
    expect(
      sameLocalCalendarMinute(
        '2026-04-10T14:01:59.999Z',
        '2026-04-10T14:02:00.000Z',
      ),
    ).toBe(false);
  });

  it('returns false for invalid timestamps', () => {
    expect(
      sameLocalCalendarMinute('not-a-date', '2026-04-10T14:01:00.000Z'),
    ).toBe(false);
  });
});

describe('isMessageGroupedWithPrevious', () => {
  it('groups same author in same calendar minute without reply', () => {
    const messages = [
      row({
        id: '1',
        authorId: 'a',
        timestamp: '2026-04-10T12:00:00.000Z',
      }),
      row({
        id: '2',
        authorId: 'a',
        timestamp: '2026-04-10T12:00:30.000Z',
      }),
    ];
    const orderedIds = ['1', '2'];
    const map = new Map(messages.map((m) => [m.id!, m]));
    expect(isMessageGroupedWithPrevious(orderedIds, map, 1)).toBe(true);
  });

  it('does not group when author differs', () => {
    const messages = [
      row({ id: '1', authorId: 'a', timestamp: '2026-04-10T12:00:00.000Z' }),
      row({ id: '2', authorId: 'b', timestamp: '2026-04-10T12:00:30.000Z' }),
    ];
    const orderedIds = ['1', '2'];
    const map = new Map(messages.map((m) => [m.id!, m]));
    expect(isMessageGroupedWithPrevious(orderedIds, map, 1)).toBe(false);
  });

  it('does not group when message is a reply', () => {
    const messages = [
      row({ id: '1', authorId: 'a', timestamp: '2026-04-10T12:00:00.000Z' }),
      row({
        id: '2',
        authorId: 'a',
        timestamp: '2026-04-10T12:00:30.000Z',
        replyTo: {
          messageId: '0',
          authorName: 'x',
          authorAvatar: '',
          content: '',
        },
      }),
    ];
    const orderedIds = ['1', '2'];
    const map = new Map(messages.map((m) => [m.id!, m]));
    expect(isMessageGroupedWithPrevious(orderedIds, map, 1)).toBe(false);
  });

  it('does not group system messages', () => {
    const messages = [
      row({
        id: '1',
        authorId: 'a',
        timestamp: '2026-04-10T12:00:00.000Z',
        systemMessage: true,
      }),
      row({ id: '2', authorId: 'a', timestamp: '2026-04-10T12:00:30.000Z' }),
    ];
    const orderedIds = ['1', '2'];
    const map = new Map(messages.map((m) => [m.id!, m]));
    expect(isMessageGroupedWithPrevious(orderedIds, map, 1)).toBe(false);
  });

  it('groups using entity fallback when the author map lags', () => {
    const orderedIds = ['1', '2'];
    const map = new Map<string, MessageWithAuthor>();
    const entities = new Map([
      [
        '1',
        {
          authorId: 'a',
          timestamp: '2026-04-10T12:00:00.000Z',
        },
      ],
      [
        '2',
        {
          authorId: 'a',
          timestamp: '2026-04-10T12:00:30.000Z',
        },
      ],
    ]);
    expect(isMessageGroupedWithPrevious(orderedIds, map, 1, entities)).toBe(
      true,
    );
  });
});
