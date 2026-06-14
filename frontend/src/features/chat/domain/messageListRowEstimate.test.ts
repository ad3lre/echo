import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX,
  MESSAGE_LIST_ROW_ESTIMATE_MIN_PX,
  estimateMessageListRowSizePx,
} from '@/features/chat/domain/messageListRowEstimate';

describe('estimateMessageListRowSizePx', () => {
  it('uses a lower floor for grouped continuation rows than headers', () => {
    const grouped = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'hi' },
    });
    const header = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'hi' },
    });
    expect(grouped).toBeLessThan(MESSAGE_LIST_ROW_ESTIMATE_MIN_PX);
    expect(grouped).toBeGreaterThanOrEqual(
      MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX,
    );
    expect(header).toBeGreaterThanOrEqual(MESSAGE_LIST_ROW_ESTIMATE_MIN_PX);
    expect(grouped).toBeLessThan(header);
  });

  it('keeps grouped short single-line estimates near measured continuation height', () => {
    const grouped = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'hello' },
    });
    expect(grouped).toBeLessThanOrEqual(58);
  });

  it('reserves full-width 16:9 image slot height before live measure', () => {
    const withSlot = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: {
        content: '',
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'imageSlot',
              attrs: {
                slotId: 'slot-1',
                aspectW: 16,
                aspectH: 9,
                imageUrl: null,
              },
            },
          ],
        },
      },
    });
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: '' },
    });
    expect(withSlot - baseline).toBe(340);
  });

  it('reserves attachment height from stored width and height', () => {
    const withAttachment = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [
          {
            url: 'https://x.test/a.png',
            kind: 'image',
            width: 2000,
            height: 100,
          },
        ],
      },
    });
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'photo' },
    });
    expect(withAttachment - baseline).toBe(40);
  });
});
