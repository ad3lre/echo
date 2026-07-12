import { describe, expect, it } from 'vitest';
import {
  computeUnresolvedResizeDeltaPx,
  MESSAGE_LIST_RESIZE_DEFER_MAX_UNRESOLVED_DELTA_PX,
  MESSAGE_LIST_RESIZE_DEFER_VIEWPORT_MARGIN_PX,
  resolveResizeMeasureAction,
} from './messageListResizeDefer';

describe('resolveResizeMeasureAction', () => {
  const base = {
    source: 'resize' as const,
    isUserScrollActive: true,
    deferFullRowHydration: true,
    experimentEnabled: true,
    prependTransactionActive: false,
    programmaticScrollPending: false,
    rowTopInContainerPx: 800,
    rowBottomInContainerPx: 900,
    scrollContainerClientHeightPx: 600,
    lastKnownSlotHeightPx: 80,
    contentHeightPx: 90,
    unresolvedDeltaPx: 10,
  };

  it('always measures on ref mount', () => {
    expect(resolveResizeMeasureAction({ ...base, source: 'ref' }).action).toBe(
      'measure_now',
    );
  });

  it('defers far off-screen resize during scroll', () => {
    expect(
      resolveResizeMeasureAction({
        ...base,
        rowTopInContainerPx: 2400,
        rowBottomInContainerPx: 2500,
      }).action,
    ).toBe('defer');
  });

  it('forces measure near viewport', () => {
    expect(
      resolveResizeMeasureAction({
        ...base,
        rowTopInContainerPx: 100,
        rowBottomInContainerPx: 180,
      }).reason,
    ).toBe('near_viewport');
  });

  it('forces measure when unresolved delta exceeds threshold', () => {
    expect(
      resolveResizeMeasureAction({
        ...base,
        unresolvedDeltaPx: MESSAGE_LIST_RESIZE_DEFER_MAX_UNRESOLVED_DELTA_PX,
      }).reason,
    ).toBe('unresolved_delta_exceeded');
  });

  it('forces measure during prepend', () => {
    expect(
      resolveResizeMeasureAction({
        ...base,
        prependTransactionActive: true,
      }).reason,
    ).toBe('prepend_or_programmatic');
  });
});

describe('computeUnresolvedResizeDeltaPx', () => {
  it('uses slot height when known', () => {
    expect(computeUnresolvedResizeDeltaPx(80, 130)).toBe(50);
    expect(computeUnresolvedResizeDeltaPx(80, 70)).toBe(0);
  });
});

describe('constants', () => {
  it('has sane defaults', () => {
    expect(MESSAGE_LIST_RESIZE_DEFER_VIEWPORT_MARGIN_PX).toBeGreaterThan(0);
    expect(MESSAGE_LIST_RESIZE_DEFER_MAX_UNRESOLVED_DELTA_PX).toBeGreaterThan(
      0,
    );
  });
});
