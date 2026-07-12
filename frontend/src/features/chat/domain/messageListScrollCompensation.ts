/**
 * Anchor-based scroll compensation reconciliation during active scroll gestures.
 * Defers ordinary TanStack compensation while the user scrolls; applies one correction
 * from resulting geometry at settle (not summed per-row deltas).
 */

export type ScrollCompensationAnchor = {
  messageId: string;
  /** Distance from anchor row top to scroll container top (px). */
  anchorTopInContainerPx: number;
  /** scrollTop when anchor was captured. */
  scrollTopPx: number;
};

export type ScrollCompensationMetricsSlice = {
  compensationEventCount: number;
  compensationDuringGestureCount: number;
  compensationAfterSettleCount: number;
  totalAbsoluteCorrectionPx: number;
  maxSingleCorrectionPx: number;
  correctionsOpposingWheelCount: number;
};

export type ScrollCompensationControllerOptions = {
  now: () => number;
};

export function computeAnchorReconcileCorrectionPx(
  anchor: ScrollCompensationAnchor,
  newAnchorTopInContainerPx: number,
): number {
  return newAnchorTopInContainerPx - anchor.anchorTopInContainerPx;
}

export function createScrollCompensationController(
  _options: ScrollCompensationControllerOptions = { now: () => Date.now() },
) {
  let pendingAnchor: ScrollCompensationAnchor | null = null;
  const metrics: ScrollCompensationMetricsSlice = {
    compensationEventCount: 0,
    compensationDuringGestureCount: 0,
    compensationAfterSettleCount: 0,
    totalAbsoluteCorrectionPx: 0,
    maxSingleCorrectionPx: 0,
    correctionsOpposingWheelCount: 0,
  };
  let lastWheelDirection: 'up' | 'down' | 'still' = 'still';

  function noteWheelDirection(direction: 'up' | 'down' | 'still'): void {
    lastWheelDirection = direction;
  }

  function captureAnchor(anchor: ScrollCompensationAnchor): void {
    if (!pendingAnchor) pendingAnchor = anchor;
  }

  function clearAnchor(): void {
    pendingAnchor = null;
  }

  function getPendingAnchor(): ScrollCompensationAnchor | null {
    return pendingAnchor;
  }

  function recordCorrection(
    deltaPx: number,
    phase: 'during_gesture' | 'after_settle',
  ): void {
    const abs = Math.abs(deltaPx);
    if (abs < 0.5) return;
    metrics.compensationEventCount++;
    if (phase === 'during_gesture') {
      metrics.compensationDuringGestureCount++;
    } else {
      metrics.compensationAfterSettleCount++;
    }
    metrics.totalAbsoluteCorrectionPx += abs;
    metrics.maxSingleCorrectionPx = Math.max(
      metrics.maxSingleCorrectionPx,
      abs,
    );
    const opposing =
      (lastWheelDirection === 'up' && deltaPx > 0) ||
      (lastWheelDirection === 'down' && deltaPx < 0);
    if (opposing) metrics.correctionsOpposingWheelCount++;
  }

  /**
   * Given anchor's new top in container after remeasure, return scrollTop correction.
   */
  function reconcileCorrectionPx(
    anchor: ScrollCompensationAnchor,
    newAnchorTopInContainerPx: number,
  ): number {
    return computeAnchorReconcileCorrectionPx(
      anchor,
      newAnchorTopInContainerPx,
    );
  }

  function getMetrics(): Readonly<ScrollCompensationMetricsSlice> {
    return { ...metrics };
  }

  function resetMetrics(): void {
    metrics.compensationEventCount = 0;
    metrics.compensationDuringGestureCount = 0;
    metrics.compensationAfterSettleCount = 0;
    metrics.totalAbsoluteCorrectionPx = 0;
    metrics.maxSingleCorrectionPx = 0;
    metrics.correctionsOpposingWheelCount = 0;
  }

  return {
    noteWheelDirection,
    captureAnchor,
    clearAnchor,
    getPendingAnchor,
    recordCorrection,
    computeAnchorReconcileCorrectionPx: reconcileCorrectionPx,
    getMetrics,
    resetMetrics,
  };
}

export type ScrollCompensationController = ReturnType<
  typeof createScrollCompensationController
>;

export type ShouldAdjustScrollPositionInput = {
  delta: number;
  itemStart: number;
  scrollOffset: number | null;
  scrollDirection: string | null | undefined;
  lastObservedScrollDirection: 'up' | 'down' | 'still';
  isUserActive: boolean;
  prependTransactionActive: boolean;
  followNewMessagesToBottom: boolean;
  experimentEnabled: boolean;
};

/**
 * TanStack `shouldAdjustScrollPositionOnItemSizeChange` policy with optional deferral.
 */
export function resolveShouldAdjustScrollPosition(
  input: ShouldAdjustScrollPositionInput,
  controller: ScrollCompensationController,
  onDeferCaptureAnchor: () => void,
): boolean {
  const {
    delta,
    itemStart,
    scrollOffset,
    scrollDirection,
    lastObservedScrollDirection,
    isUserActive,
    prependTransactionActive,
    followNewMessagesToBottom,
    experimentEnabled,
  } = input;

  if (delta <= 0) return false;

  // Prepend / unmeasured history: always compensate.
  if (prependTransactionActive) return true;

  const scrollingUp =
    lastObservedScrollDirection === 'up' || scrollDirection === 'backward';
  const rowAboveViewport = itemStart < (scrollOffset ?? 0);

  let wouldCompensate = false;
  if (scrollingUp && delta > 0) wouldCompensate = true;
  else if (rowAboveViewport) wouldCompensate = true;
  else if (followNewMessagesToBottom && !isUserActive) wouldCompensate = true;

  if (!wouldCompensate) return false;

  if (!experimentEnabled || !isUserActive) {
    if (wouldCompensate) {
      controller.recordCorrection(delta, 'during_gesture');
    }
    return wouldCompensate;
  }

  // Defer ordinary compensation during gesture; reconcile at settle via anchor.
  onDeferCaptureAnchor();
  return false;
}
