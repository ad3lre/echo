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
});
