import type { MessageListViewportSnapshot } from '@/features/chat/composables/messageListViewportStorage';

export type MessageListInitialOffsetInput = {
  saved: MessageListViewportSnapshot | null;
  orderedIds: readonly string[];
  /** Sum of row estimates for indices `[0, anchorIndex)` minus `anchorTop`. */
  estimateOffsetToAnchor: (anchorIndex: number, anchorTop: number) => number;
  /** Estimated scroll offset that pins the list to the bottom. */
  estimateBottomOffset: () => number;
};

/**
 * First-paint scroll offset for the virtualizer when a channel opens.
 *
 * - `followNewMessages` → bottom estimate (anchor estimates undershoot real heights).
 * - Mid-history with anchor in window → anchor estimate (DOM restore refines after mount).
 * - Mid-history with anchor outside window → top (restore prefetches; never guess tail).
 * - No memory → bottom (default for a fresh channel).
 */
export function resolveMessageListInitialOffsetPx(
  input: MessageListInitialOffsetInput,
): number {
  const { saved, orderedIds, estimateOffsetToAnchor, estimateBottomOffset } =
    input;

  if (saved && !saved.followNewMessages) {
    const anchorIndex = orderedIds.indexOf(saved.anchorMessageId);
    if (anchorIndex >= 0) {
      return Math.max(0, estimateOffsetToAnchor(anchorIndex, saved.anchorTop));
    }
    // Restore will prefetch the anchor — painting the tail would flash before jump.
    return 0;
  }

  return estimateBottomOffset();
}
