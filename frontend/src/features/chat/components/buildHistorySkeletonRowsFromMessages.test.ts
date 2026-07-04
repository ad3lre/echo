import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { buildHistorySkeletonRowsFromMessages } from './buildHistorySkeletonRowsFromMessages';

function msg(
  id: string,
  authorId: string,
  content: string,
  timestamp: string,
): RawMessage {
  return { id, authorId, content, timestamp };
}

describe('buildHistorySkeletonRowsFromMessages', () => {
  it('returns static template for empty input', () => {
    const rows = buildHistorySkeletonRowsFromMessages([]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('mirrors same-author grouping and line widths from cached messages', () => {
    const rows = buildHistorySkeletonRowsFromMessages(
      [
        msg('m1', 'u1', 'Hello there', '2026-01-01T12:00:00.000Z'),
        msg('m2', 'u1', 'Second line in cluster', '2026-01-01T12:00:05.000Z'),
        msg('m3', 'u2', 'Different author now', '2026-01-01T12:05:00.000Z'),
      ],
      (authorId) => (authorId === 'u1' ? 'Alice' : 'Bob'),
    );
    expect(rows[0]?.grouped).toBe(false);
    expect(rows[1]?.grouped).toBe(true);
    expect(rows[2]?.grouped).toBe(false);
    expect(rows[0]?.nameWidth).toBe('w-16');
  });
});
