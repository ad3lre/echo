import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMessageListInitialOffsetPx } from './messageListInitialOffset';

describe('resolveMessageListInitialOffsetPx', () => {
  const orderedIds = ['m1', 'm2', 'm3', 'm4', 'm5'];
  const estimateOffsetToAnchor = vi.fn(
    (anchorIndex: number, anchorTop: number) => anchorIndex * 88 - anchorTop,
  );
  const estimateBottomOffset = vi.fn(() => 400);

  beforeEach(() => {
    estimateOffsetToAnchor.mockClear();
    estimateBottomOffset.mockClear();
  });

  it('uses bottom estimate when there is no saved viewport', () => {
    expect(
      resolveMessageListInitialOffsetPx({
        saved: null,
        orderedIds,
        estimateOffsetToAnchor,
        estimateBottomOffset,
      }),
    ).toBe(400);
    expect(estimateBottomOffset).toHaveBeenCalled();
  });

  it('uses bottom estimate when followNewMessages is true', () => {
    expect(
      resolveMessageListInitialOffsetPx({
        saved: {
          anchorMessageId: 'm5',
          anchorTop: 120,
          followNewMessages: true,
          updatedAt: 1,
        },
        orderedIds,
        estimateOffsetToAnchor,
        estimateBottomOffset,
      }),
    ).toBe(400);
    expect(estimateOffsetToAnchor).not.toHaveBeenCalled();
  });

  it('uses anchor estimate for mid-history when anchor is in the window', () => {
    expect(
      resolveMessageListInitialOffsetPx({
        saved: {
          anchorMessageId: 'm3',
          anchorTop: 48,
          followNewMessages: false,
          updatedAt: 1,
        },
        orderedIds,
        estimateOffsetToAnchor,
        estimateBottomOffset,
      }),
    ).toBe(2 * 88 - 48);
    expect(estimateBottomOffset).not.toHaveBeenCalled();
  });

  it('starts at top when mid-history anchor is outside the current window', () => {
    expect(
      resolveMessageListInitialOffsetPx({
        saved: {
          anchorMessageId: 'm99',
          anchorTop: 48,
          followNewMessages: false,
          updatedAt: 1,
        },
        orderedIds,
        estimateOffsetToAnchor,
        estimateBottomOffset,
      }),
    ).toBe(0);
    expect(estimateOffsetToAnchor).not.toHaveBeenCalled();
    expect(estimateBottomOffset).not.toHaveBeenCalled();
  });
});
