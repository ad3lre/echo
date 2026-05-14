import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  compareEchoTimelineIds,
  isEchoMessageRead,
  isSeenAheadOfCursor,
  resolveEchoMessageReadState,
} from './echoMessageReadState';

function stubMsg(id: string): RawMessage {
  return { id } as RawMessage;
}

describe('echoMessageReadState', () => {
  it('compares timeline ids in monotonic order', () => {
    expect(
      compareEchoTimelineIds('1492135200000000002', '1492135200000000001'),
    ).toBe(1);
    expect(
      compareEchoTimelineIds('1492135200000000001', '1492135200000000002'),
    ).toBe(-1);
    expect(
      compareEchoTimelineIds('1492135200000000001', '1492135200000000001'),
    ).toBe(0);
  });

  it('compares UUID-style ids lexicographically', () => {
    expect(compareEchoTimelineIds('aaa', 'bbb')).toBe(-1);
    expect(compareEchoTimelineIds('bbb', 'aaa')).toBe(1);
    expect(compareEchoTimelineIds('abc', 'abc')).toBe(0);
  });

  it('treats messages at or behind the read cursor as read', () => {
    expect(
      isEchoMessageRead('1492135200000000002', '1492135200000000001'),
    ).toBe(true);
  });

  it('resolves messages ahead of the read cursor as unread', () => {
    expect(
      resolveEchoMessageReadState({
        lastReadMessageId: '1492135200000000001',
        messageId: '1492135200000000002',
      }),
    ).toBe('unread');
  });
});

describe('isSeenAheadOfCursor', () => {
  it('returns true when seenId is a larger snowflake than cursorId', () => {
    expect(isSeenAheadOfCursor('1000', '999')).toBe(true);
  });

  it('returns false when seenId equals cursorId', () => {
    expect(isSeenAheadOfCursor('1000', '1000')).toBe(false);
  });

  it('returns false when seenId is behind cursorId (snowflake)', () => {
    expect(isSeenAheadOfCursor('999', '1000')).toBe(false);
  });

  it('uses channel message array order for non-numeric ids', () => {
    const msgs = [stubMsg('uuid-a'), stubMsg('uuid-b'), stubMsg('uuid-c')];
    expect(isSeenAheadOfCursor('uuid-c', 'uuid-a', msgs)).toBe(true);
    expect(isSeenAheadOfCursor('uuid-a', 'uuid-c', msgs)).toBe(false);
  });

  it('returns false when ordering cannot be determined (no messages)', () => {
    expect(isSeenAheadOfCursor('uuid-x', 'uuid-y')).toBe(false);
  });

  it('returns false when neither id is found in the message array', () => {
    const msgs = [stubMsg('uuid-a')];
    expect(isSeenAheadOfCursor('uuid-x', 'uuid-y', msgs)).toBe(false);
  });

  it('returns false when only one id is found in the message array', () => {
    const msgs = [stubMsg('uuid-a'), stubMsg('uuid-b')];
    expect(isSeenAheadOfCursor('uuid-b', 'uuid-missing', msgs)).toBe(false);
  });
});
