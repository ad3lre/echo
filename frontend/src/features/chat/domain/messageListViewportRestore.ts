import {
  ANCHOR_DRIFT_THRESHOLD_PX,
  measureMessageTopInContainer,
} from '@/features/chat/domain/messageListPrependAnchor';

export type VirtualizerScrollApi = {
  scrollToIndex: (
    index: number,
    opts: { align: 'start' | 'center' | 'end'; behavior: 'auto' | 'smooth' },
  ) => void;
};

export type ViewportRestoreSnapshot = {
  anchorMessageId: string;
  anchorTop: number;
};

function clampScrollTop(container: HTMLElement, scrollTop: number): number {
  return Math.max(
    0,
    Math.min(scrollTop, container.scrollHeight - container.clientHeight),
  );
}

/** Apply pixel delta so the anchor message sits at the saved offset. */
export function applyViewportAnchorPixelDelta(
  container: HTMLElement,
  snapshot: ViewportRestoreSnapshot,
  driftThresholdPx = ANCHOR_DRIFT_THRESHOLD_PX,
): boolean {
  const anchorTopAfter = measureMessageTopInContainer(
    container,
    snapshot.anchorMessageId,
  );
  if (anchorTopAfter == null) return false;
  const delta = anchorTopAfter - snapshot.anchorTop;
  if (Math.abs(delta) <= driftThresholdPx) return true;
  container.scrollTop = clampScrollTop(container, container.scrollTop + delta);
  return true;
}

/**
 * Restore saved viewport: scroll virtualizer to anchor row, then snap pixel offset.
 * Returns false when the anchor row cannot be measured (e.g. not mounted yet).
 */
export function restoreViewportAnchorInContainer(
  container: HTMLElement,
  orderedIds: readonly string[],
  virtualizer: VirtualizerScrollApi,
  snapshot: ViewportRestoreSnapshot,
): boolean {
  const anchorIndex = orderedIds.indexOf(snapshot.anchorMessageId);
  if (anchorIndex < 0) return false;

  virtualizer.scrollToIndex(anchorIndex, { align: 'start', behavior: 'auto' });
  return applyViewportAnchorPixelDelta(container, snapshot);
}

export const VIEWPORT_RESTORE_DOM_RETRY = 8;
