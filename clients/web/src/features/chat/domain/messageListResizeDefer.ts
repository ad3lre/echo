/**
 * Bounded resize measurement deferral during active scroll gestures.
 */

export const MESSAGE_LIST_RESIZE_DEFER_VIEWPORT_MARGIN_PX = 200;
export const MESSAGE_LIST_RESIZE_DEFER_MAX_UNRESOLVED_DELTA_PX = 48;

export type ResizeDeferDecision =
  | { action: 'measure_now'; reason: string }
  | { action: 'defer'; reason: string };

export type ResizeDeferInput = {
  source: 'ref' | 'resize';
  isUserScrollActive: boolean;
  deferFullRowHydration: boolean;
  experimentEnabled: boolean;
  prependTransactionActive: boolean;
  programmaticScrollPending: boolean;
  /** Row top relative to scroll container (px). */
  rowTopInContainerPx: number | null;
  /** Row bottom relative to scroll container (px). */
  rowBottomInContainerPx: number | null;
  scrollContainerClientHeightPx: number;
  /** Latest known virtual slot height for this row. */
  lastKnownSlotHeightPx: number | null;
  /** Latest DOM height from ResizeObserver contentRect. */
  contentHeightPx: number | null;
  /** Accumulated unresolved height delta for this row key. */
  unresolvedDeltaPx: number;
};

export function resolveResizeMeasureAction(
  input: ResizeDeferInput,
): ResizeDeferDecision {
  if (input.source === 'ref') {
    return { action: 'measure_now', reason: 'first_mount_ref' };
  }

  if (!input.experimentEnabled) {
    return { action: 'measure_now', reason: 'experiment_off' };
  }

  if (input.prependTransactionActive || input.programmaticScrollPending) {
    return { action: 'measure_now', reason: 'prepend_or_programmatic' };
  }

  const scrollActive = input.isUserScrollActive || input.deferFullRowHydration;
  if (!scrollActive) {
    return { action: 'measure_now', reason: 'scroll_idle' };
  }

  // Absolute virtual rows cannot paint taller than their slot — never defer when
  // content already exceeds the last known height (visible overlap otherwise).
  if (
    input.contentHeightPx != null &&
    input.lastKnownSlotHeightPx != null &&
    input.lastKnownSlotHeightPx > 0 &&
    input.contentHeightPx > input.lastKnownSlotHeightPx + 0.5
  ) {
    return { action: 'measure_now', reason: 'content_exceeds_slot' };
  }

  if (
    input.unresolvedDeltaPx >= MESSAGE_LIST_RESIZE_DEFER_MAX_UNRESOLVED_DELTA_PX
  ) {
    return {
      action: 'measure_now',
      reason: 'unresolved_delta_exceeded',
    };
  }

  const margin = MESSAGE_LIST_RESIZE_DEFER_VIEWPORT_MARGIN_PX;
  const viewH = input.scrollContainerClientHeightPx;
  if (
    input.rowTopInContainerPx != null &&
    input.rowBottomInContainerPx != null &&
    viewH > 0
  ) {
    const nearViewport =
      input.rowBottomInContainerPx >= -margin &&
      input.rowTopInContainerPx <= viewH + margin;
    if (nearViewport) {
      return { action: 'measure_now', reason: 'near_viewport' };
    }
  }

  return { action: 'defer', reason: 'scroll_active_bounded' };
}

export function computeUnresolvedResizeDeltaPx(
  lastKnownSlotHeightPx: number | null,
  contentHeightPx: number,
): number {
  if (lastKnownSlotHeightPx == null || lastKnownSlotHeightPx <= 0) {
    return Math.max(0, contentHeightPx);
  }
  return Math.max(0, contentHeightPx - lastKnownSlotHeightPx);
}

export type ResizeDeferMetricsSlice = {
  resizeObserverCallbackCount: number;
  measureNowCount: number;
  measureDeferredCount: number;
  deferredKeysAtSettle: number;
  settleFlushDurationMs: number;
  settleFlushDurationMaxMs: number;
};

export function createResizeDeferMetrics(): ResizeDeferMetricsSlice {
  return {
    resizeObserverCallbackCount: 0,
    measureNowCount: 0,
    measureDeferredCount: 0,
    deferredKeysAtSettle: 0,
    settleFlushDurationMs: 0,
    settleFlushDurationMaxMs: 0,
  };
}
