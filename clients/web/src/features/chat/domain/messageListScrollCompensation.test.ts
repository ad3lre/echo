import { describe, expect, it } from 'vitest';
import {
  computeAnchorReconcileCorrectionPx,
  createScrollCompensationController,
  resolveShouldAdjustScrollPosition,
} from './messageListScrollCompensation';

describe('resolveShouldAdjustScrollPosition', () => {
  const controller = createScrollCompensationController();

  it('always compensates during prepend transaction', () => {
    expect(
      resolveShouldAdjustScrollPosition(
        {
          delta: 20,
          itemStart: 0,
          scrollOffset: 100,
          scrollDirection: 'forward',
          lastObservedScrollDirection: 'down',
          isUserActive: true,
          prependTransactionActive: true,
          followNewMessagesToBottom: false,
          experimentEnabled: true,
        },
        controller,
        () => {},
      ),
    ).toBe(true);
  });

  it('defers compensation during active scroll when experiment enabled', () => {
    let captured = false;
    expect(
      resolveShouldAdjustScrollPosition(
        {
          delta: 30,
          itemStart: 0,
          scrollOffset: 200,
          scrollDirection: 'backward',
          lastObservedScrollDirection: 'up',
          isUserActive: true,
          prependTransactionActive: false,
          followNewMessagesToBottom: false,
          experimentEnabled: true,
        },
        controller,
        () => {
          captured = true;
        },
      ),
    ).toBe(false);
    expect(captured).toBe(true);
  });

  it('compensates when idle and row above viewport grows', () => {
    expect(
      resolveShouldAdjustScrollPosition(
        {
          delta: 12,
          itemStart: 50,
          scrollOffset: 100,
          scrollDirection: null,
          lastObservedScrollDirection: 'still',
          isUserActive: false,
          prependTransactionActive: false,
          followNewMessagesToBottom: false,
          experimentEnabled: true,
        },
        controller,
        () => {},
      ),
    ).toBe(true);
  });
});

describe('computeAnchorReconcileCorrectionPx', () => {
  it('returns displacement needed to restore anchor top', () => {
    const anchor = {
      messageId: 'm1',
      anchorTopInContainerPx: 120,
      scrollTopPx: 400,
    };
    expect(computeAnchorReconcileCorrectionPx(anchor, 145)).toBe(25);
    expect(computeAnchorReconcileCorrectionPx(anchor, 100)).toBe(-20);
  });
});
