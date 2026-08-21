import { describe, expect, it } from 'vitest';
import {
  isMessageReactionFanoutSummary,
  mergeFanoutMessageReactions,
  toMessageReactionFanoutPayload,
} from './messageReactionsWire';
import type { MessageReaction } from './types/message';

describe('messageReactionsWire', () => {
  it('strips userIds for fan-out while keeping counts', () => {
    const full: MessageReaction[] = [
      {
        emoji: '👍',
        count: 3,
        userIds: ['u1', 'u2', 'u3'],
        firstReactionAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(toMessageReactionFanoutPayload(full)).toEqual([
      {
        emoji: '👍',
        count: 3,
        userIds: [],
        firstReactionAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('detects fan-out summary rows', () => {
    expect(
      isMessageReactionFanoutSummary({ emoji: 'a', count: 2, userIds: [] }),
    ).toBe(true);
    expect(
      isMessageReactionFanoutSummary({ emoji: 'a', count: 0, userIds: [] }),
    ).toBe(false);
    expect(
      isMessageReactionFanoutSummary({
        emoji: 'a',
        count: 1,
        userIds: ['u1'],
      }),
    ).toBe(false);
  });

  it('preserves viewer highlight when merging fan-out', () => {
    const existing: MessageReaction[] = [
      { emoji: '🔥', count: 2, userIds: ['me', 'other'] },
    ];
    const incoming: MessageReaction[] = [
      { emoji: '🔥', count: 3, userIds: [] },
    ];
    expect(mergeFanoutMessageReactions(existing, incoming, 'me')).toEqual([
      { emoji: '🔥', count: 3, userIds: ['me'] },
    ]);
  });

  it('passes through full snapshots unchanged', () => {
    const incoming: MessageReaction[] = [
      { emoji: '🔥', count: 1, userIds: ['u2'] },
    ];
    expect(mergeFanoutMessageReactions([], incoming, 'me')).toStrictEqual(
      incoming,
    );
  });
});
