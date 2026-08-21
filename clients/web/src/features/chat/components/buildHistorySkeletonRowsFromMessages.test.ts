import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { buildHistorySkeletonRowsFromMessages } from './buildHistorySkeletonRowsFromMessages';
import {
  HISTORY_SKELETON_IMAGE_SLOT_MAX_WIDTH_CSS,
  HISTORY_SKELETON_MEDIA_BLOCK,
} from './messageListHistorySkeleton';

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
    expect(rows[0]?.daySeparatorLabel).toBeTruthy();
  });

  it('reserves day separators and does not tighten headers across day boundaries', () => {
    const rows = buildHistorySkeletonRowsFromMessages([
      msg('m1', 'u1', 'First day', '2026-01-01T12:00:00.000Z'),
      msg('m2', 'u2', 'Next day', '2026-01-02T12:00:00.000Z'),
    ]);

    expect(rows[1]?.daySeparatorLabel).toBeTruthy();
    expect(rows[1]?.clustered).toBeUndefined();
  });

  it('can mirror the oldest in-window rows for scroll-up placeholders', () => {
    const rows = buildHistorySkeletonRowsFromMessages(
      [
        msg('m1', 'u1', 'Oldest visible', '2026-01-01T12:00:00.000Z'),
        msg('m2', 'u1', 'Still same author', '2026-01-01T12:00:05.000Z'),
        msg('m3', 'u2', 'Newer in window', '2026-01-01T12:05:00.000Z'),
      ],
      (authorId) => (authorId === 'u1' ? 'Alice' : 'Bob'),
      { edge: 'head' },
    );
    expect(rows[0]?.grouped).toBe(false);
    expect(rows[1]?.grouped).toBe(true);
    expect(rows[2]?.grouped).toBe(false);
  });

  it('uses the fixed collage skeleton for image attachments', () => {
    const rows = buildHistorySkeletonRowsFromMessages([
      {
        ...msg('m1', 'u1', 'photo', '2026-01-01T12:00:00.000Z'),
        attachments: [
          {
            kind: 'image',
            url: 'https://cdn.example.com/a.jpg',
            width: 900,
            height: 1600,
          },
        ],
      },
    ]);
    expect(rows[0]?.imageBlocks?.[0]).toMatchObject(
      HISTORY_SKELETON_MEDIA_BLOCK,
    );
  });

  it('preserves rich image-slot aspect and max width metadata', () => {
    const rows = buildHistorySkeletonRowsFromMessages([
      {
        ...msg('m1', 'u1', 'slot', '2026-01-01T12:00:00.000Z'),
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'imageSlot',
              attrs: {
                slotId: 'slot-1',
                aspectW: 1,
                aspectH: 1,
                imageUrl: null,
                storageKey: null,
                width: null,
                height: null,
              },
            },
          ],
        },
      },
    ]);
    expect(rows[0]?.imageBlocks?.[0]).toMatchObject({
      aspectW: 1,
      aspectH: 1,
      maxWidthCss: HISTORY_SKELETON_IMAGE_SLOT_MAX_WIDTH_CSS,
    });
  });

  it('reserves structured block height for polls', () => {
    const rows = buildHistorySkeletonRowsFromMessages([
      {
        ...msg('m1', 'u1', 'poll', '2026-01-01T12:00:00.000Z'),
        poll: {
          question: 'Should Echo be 18+?',
          options: [
            { id: 'yes', text: 'Yes', votes: 4, voterIds: [] },
            { id: 'no', text: 'No', votes: 3, voterIds: [] },
            { id: 'maybe', text: 'Maybe', votes: 0, voterIds: [] },
          ],
        },
      },
    ]);
    expect(rows[0]?.blockHeights?.[0]).toBe(200);
  });
});
