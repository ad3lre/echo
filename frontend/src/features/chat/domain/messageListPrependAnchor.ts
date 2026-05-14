/**
 * Prepend scroll restore: **anchor = message id + pixel offset** in the container, then
 * bounded pixel snaps — never “stabilize by index” across a merge. Contract:
 * `@/features/chat/domain/viewportContract`.
 */
export const ANCHOR_VISIBILITY_THRESHOLD_PX = 4;
export const ANCHOR_DRIFT_THRESHOLD_PX = 2;

/** Hard cap: anchor pixel snaps after prepend — no stabilize-until-perfect loops. */
export const MAX_PREPEND_ANCHOR_SNAP_PASSES = 2;

export type VirtualItemLike = {
  index: number;
};

export type PrependSnapshot = {
  channelId: string;
  txId: number;
  /** Message row that must stay visually fixed (never an index). */
  anchorMessageId: string;
  /** Anchor top edge offset inside the scroll container viewport (px). */
  anchorTopBefore: number;
  scrollTopBefore: number;
  scrollHeightBefore: number;
};

export type PrependScrollRestoreResult = {
  /** `scrollHeightAfter - scrollHeightBefore` — prepend growth (px). */
  heightDeltaApplied: number;
  /** Sum of anchor snap deltas (at most {@link MAX_PREPEND_ANCHOR_SNAP_PASSES} passes). */
  anchorSnapDeltaApplied: number;
  /** How many anchor snap passes ran (0–MAX_PREPEND_ANCHOR_SNAP_PASSES). */
  anchorSnapPassesUsed: number;
};

function clampScrollTop(container: HTMLElement, scrollTop: number): number {
  return Math.max(
    0,
    Math.min(scrollTop, container.scrollHeight - container.clientHeight),
  );
}

function queryMessageSelector(messageId: string): string {
  const raw = `message-${messageId}`;
  try {
    return `#${CSS.escape(raw)}`;
  } catch {
    return `[id="${raw.replace(/"/g, '')}"]`;
  }
}

export function getMessageElementById(
  container: HTMLElement,
  messageId: string,
): HTMLElement | null {
  if (!messageId) return null;
  return container.querySelector(
    queryMessageSelector(messageId),
  ) as HTMLElement | null;
}

export function measureMessageTopInContainer(
  container: HTMLElement,
  messageId: string,
): number | null {
  const element = getMessageElementById(container, messageId);
  if (!element) return null;
  const containerRect = container.getBoundingClientRect();
  const messageRect = element.getBoundingClientRect();
  return messageRect.top - containerRect.top;
}

export function getAnchorMessageIdFromViewport<
  T extends { id?: string | null },
>(
  container: HTMLElement,
  virtualItems: readonly VirtualItemLike[],
  orderedIds: readonly string[],
  messagesMap: Map<string, T>,
  thresholdPx = ANCHOR_VISIBILITY_THRESHOLD_PX,
): { anchorMessageId: string } | null {
  const containerRect = container.getBoundingClientRect();
  const thresholdTop = containerRect.top + thresholdPx;
  const thresholdBottom = containerRect.bottom - thresholdPx;
  for (let i = virtualItems.length - 1; i >= 0; i -= 1) {
    const item = virtualItems[i]!;
    const messageId = orderedIds[item.index];
    if (!messageId) continue;
    const element = getMessageElementById(container, messageId);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.top < thresholdBottom && rect.bottom > thresholdTop) {
      return {
        anchorMessageId: messageId,
      };
    }
  }

  for (let i = orderedIds.length - 1; i >= 0; i -= 1) {
    const fallbackId = orderedIds[i];
    if (!fallbackId) continue;
    return {
      anchorMessageId: fallbackId,
    };
  }
  return null;
}

export function getScrollDirection(
  previousScrollTop: number,
  nextScrollTop: number,
): 'up' | 'down' | 'still' {
  if (nextScrollTop < previousScrollTop) return 'up';
  if (nextScrollTop > previousScrollTop) return 'down';
  return 'still';
}

/**
 * Single commit for scroll after prepend (one call site).
 * (1) `scrollTop += scrollHeight - scrollHeightBefore` (height growth from merge),
 * (2) At most {@link MAX_PREPEND_ANCHOR_SNAP_PASSES} anchor snaps if still beyond threshold — then stop.
 *
 * Index / `scrollToIndex` is not part of this model.
 */
export function restorePrependScroll(
  container: HTMLElement,
  snapshot: PrependSnapshot,
  driftThresholdPx = ANCHOR_DRIFT_THRESHOLD_PX,
): PrependScrollRestoreResult {
  const hAfter = container.scrollHeight;
  const heightDelta = hAfter - snapshot.scrollHeightBefore;
  if (heightDelta !== 0) {
    container.scrollTop = clampScrollTop(
      container,
      container.scrollTop + heightDelta,
    );
  }

  let anchorSnapDeltaApplied = 0;
  let anchorSnapPassesUsed = 0;
  for (let pass = 0; pass < MAX_PREPEND_ANCHOR_SNAP_PASSES; pass += 1) {
    const measured = measureMessageTopInContainer(
      container,
      snapshot.anchorMessageId,
    );
    if (measured == null) break;
    const snap = measured - snapshot.anchorTopBefore;
    if (Math.abs(snap) <= driftThresholdPx) break;
    container.scrollTop = clampScrollTop(container, container.scrollTop + snap);
    anchorSnapDeltaApplied += snap;
    anchorSnapPassesUsed += 1;
  }

  return {
    heightDeltaApplied: heightDelta,
    anchorSnapDeltaApplied,
    anchorSnapPassesUsed,
  };
}

/** @deprecated Use `restorePrependScroll` — kept for tests that only exercise anchor snap. */
export function restoreAnchorByPixelDelta(
  container: HTMLElement,
  snapshot: PrependSnapshot,
): number | null {
  const measured = measureMessageTopInContainer(
    container,
    snapshot.anchorMessageId,
  );
  if (measured == null) return null;
  const delta = measured - snapshot.anchorTopBefore;
  if (delta === 0) return 0;
  container.scrollTop = clampScrollTop(container, container.scrollTop + delta);
  return delta;
}

export function isAnchorDriftBeyondThreshold(
  container: HTMLElement,
  snapshot: PrependSnapshot,
  thresholdPx = ANCHOR_DRIFT_THRESHOLD_PX,
): boolean {
  const anchorTopAfter = measureMessageTopInContainer(
    container,
    snapshot.anchorMessageId,
  );
  if (anchorTopAfter == null) return false;
  return Math.abs(anchorTopAfter - snapshot.anchorTopBefore) > thresholdPx;
}
