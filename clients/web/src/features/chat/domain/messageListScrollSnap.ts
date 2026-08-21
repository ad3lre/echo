/** Downward-only bottom snap — never reduces scrollTop (see MessageList contract). */
export function downwardOnlySnapScrollTop(
  currentScrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  if (currentScrollTop < maxScroll - 0.5) return maxScroll;
  return currentScrollTop;
}

/** True when already within tolerance of the bottom edge. */
export function isScrollNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  tolerancePx = 2,
): boolean {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  return maxScroll - scrollTop <= tolerancePx;
}

/**
 * `scrollToIndex(align: 'end')` can yank **upward** when row estimates shrink after
 * measure. When already at the bottom (virtualizer or DOM), use downward-only snap instead.
 */
export function shouldSkipScrollToIndexForLatest(options: {
  smooth: boolean;
  forceScrollToIndex?: boolean;
  virtualDistFromBottomPx: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  virtualNearBottomTolerancePx?: number;
  domNearBottomTolerancePx?: number;
  /** When DOM is at bottom but virtualizer lags, still skip corrective scrollToIndex. */
  nearBottomAttachPx?: number;
}): boolean {
  if (options.forceScrollToIndex) return false;
  const domTolerance = options.domNearBottomTolerancePx ?? 2;
  const domNear = isScrollNearBottom(
    options.scrollTop,
    options.scrollHeight,
    options.clientHeight,
    domTolerance,
  );
  const maxScroll = Math.max(0, options.scrollHeight - options.clientHeight);
  if (options.smooth) return domNear;
  const virtTolerance = options.virtualNearBottomTolerancePx ?? 2;
  const virtNear =
    options.virtualDistFromBottomPx >= 0 &&
    options.virtualDistFromBottomPx <= virtTolerance;
  if (virtNear) return true;
  const attachPx = options.nearBottomAttachPx ?? 80;
  if (domNear && options.virtualDistFromBottomPx <= attachPx) return true;
  if (maxScroll <= domTolerance) {
    return domNear && options.virtualDistFromBottomPx <= attachPx;
  }
  return false;
}
