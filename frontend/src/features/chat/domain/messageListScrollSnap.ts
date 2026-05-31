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
