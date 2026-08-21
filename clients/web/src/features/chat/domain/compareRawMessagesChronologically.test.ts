import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { compareRawMessagesChronologically } from '@/features/chat/domain/channelMessageOrder';

function msg(
  p: Partial<RawMessage> & Pick<RawMessage, 'timestamp'>,
): RawMessage {
  return {
    authorId: 'u1',
    content: 'x',
    ...p,
  };
}

describe('compareRawMessagesChronologically', () => {
  it('orders by timestamp when ids are mixed shapes', () => {
    const a = msg({
      id: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2020-01-02T00:00:00.000Z',
    });
    const b = msg({
      id: '1730000000000000000',
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(compareRawMessagesChronologically(a, b)).toBeGreaterThan(0);
    expect(compareRawMessagesChronologically(b, a)).toBeLessThan(0);
  });

  it('uses numeric snowflake order when timestamps tie', () => {
    const ts = '2020-01-01T00:00:00.000Z';
    const a = msg({ id: '1730000000000000001', timestamp: ts });
    const b = msg({ id: '1730000000000000002', timestamp: ts });
    expect(compareRawMessagesChronologically(a, b)).toBeLessThan(0);
  });

  it('orders by snowflake time when timestamp string does not parse', () => {
    const a = msg({
      id: '1730000000000000001',
      timestamp: 'not-a-date',
    });
    const b = msg({
      id: '1730000000000000002',
      timestamp: 'not-a-date',
    });
    expect(compareRawMessagesChronologically(a, b)).toBeLessThan(0);
  });
});
