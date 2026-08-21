/**
 * Message list — **scroll / jump UI side-effects**.
 *
 * Owns scroll-listener coalescing (idle rAF), jump FAB updates, load-newer
 * eligibility, user-gesture ownership claims, and pending-new-while-away
 * bookkeeping. Does not own load-older gating, viewport memory, or
 * programmatic scroll writes beyond the injected jump-to-latest callback.
 */

import { nextTick, watch, type Ref } from 'vue';
import {
  getScrollDirection,
  type VirtualItemLike,
} from '@/features/chat/domain/messageListPrependAnchor';
import type {
  ScrollEventClassification,
  ScrollIntent,
} from '@/features/chat/domain/messageListScrollOwnership';
import { isEchoMessageLogicallyOwn } from '@/features/chat/domain/discordTwinMessageOwnership';
import type { MessageListJumpUi } from '@/features/chat/domain/messageListJumpUi';
import { logMessageListThrottled } from '@/features/chat/composables/messageListDebugLog';
import { messageListScrollMetricsApi } from '@/features/chat/composables/messageListScrollMetrics';
import type { MessageWithAuthor } from '@shared/types';

export type MessageListScrollObservation = {
  scrollTop: number;
  direction: 'up' | 'down' | 'still';
};

export type MessageListScrollSideEffectsVirtualizer = {
  getVirtualItems: () => ReadonlyArray<VirtualItemLike>;
  getTotalSize: () => number;
};

export type UseMessageListScrollSideEffectsOptions = {
  getContainer: () => HTMLElement | null;
  getVirtualizer: () =>
    | MessageListScrollSideEffectsVirtualizer
    | null
    | undefined;
  getDisplayOrderedIds: () => readonly string[];
  getMessages: () => Map<string, MessageWithAuthor>;
  getCurrentUserId: () => string | undefined;
  getLinkedDiscordUserId: () => string | null | undefined;
  jumpUi: MessageListJumpUi;
  followNewMessagesToBottom: Ref<boolean>;
  prependTransactionActive: Ref<boolean>;
  activePrependTxId: Ref<number>;
  suppressListUntilInitialAnchor: Ref<boolean>;
  distanceFromBottomPx: () => number;
  nearBottomPx: number;
  nearTopPx: number;
  followNewDetachPx: number;
  followNewAttachPx: number;
  bottomJumpShowMessages: number;
  nowMs: () => number;
  noteWheelDirection: (direction: 'up' | 'down' | 'still') => void;
  noteScrollEvent: () => ScrollEventClassification;
  markUserGesture: () => void;
  markScrollHydrationDeferral: () => void;
  runLoadOlderIfEligible: () => void;
  canLoadNewer: () => boolean;
  loadNewer: () => void | Promise<void>;
  resolveSeenMessageId: () => string | null;
  emitSeenMessageId: (next: string | null) => void;
  schedulePersistViewportMemory: () => void;
  scrollToBottom: (smooth?: boolean, intent?: ScrollIntent) => void;
  /**
   * Shared mutable scroll observation (direction / last scrollTop). Owned by the
   * caller so virtualizer compensation can read it before this composable runs.
   */
  scrollObservation: MessageListScrollObservation;
};

type ScrollSideEffectsState = {
  jumpRaf: number | null;
  idleRaf: number | null;
  observation: MessageListScrollObservation;
  options: UseMessageListScrollSideEffectsOptions;
};

const NAVIGATION_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

function updateJumpUiFromScroll(state: ScrollSideEffectsState): void {
  const opts = state.options;
  if (opts.prependTransactionActive.value) return;
  state.jumpRaf = null;
  const totalMsgs = opts.getDisplayOrderedIds().length;
  const virtualItems = opts.getVirtualizer()?.getVirtualItems() ?? [];
  const lastVisibleIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1]!.index
      : totalMsgs - 1;
  const hiddenFromBottom = Math.max(0, totalMsgs - 1 - lastVisibleIndex);
  const scrollAway = hiddenFromBottom >= opts.bottomJumpShowMessages;
  if (opts.jumpUi.scrollAwayFromBottom.value !== scrollAway) {
    opts.jumpUi.scrollAwayFromBottom.value = scrollAway;
  }
  const d = opts.distanceFromBottomPx();
  if (d > opts.followNewDetachPx) opts.followNewMessagesToBottom.value = false;
  else if (d < opts.followNewAttachPx)
    opts.followNewMessagesToBottom.value = true;
  if (d < opts.nearBottomPx && opts.jumpUi.pendingNewWhileAway.value !== 0) {
    opts.jumpUi.pendingNewWhileAway.value = 0;
  }
}

/** Non-scroll paths (e.g. jump-to-bottom) — still one rAF, no scroll listener work. */
function scheduleJumpUiFromScroll(state: ScrollSideEffectsState): void {
  if (state.options.prependTransactionActive.value) return;
  if (state.jumpRaf != null) return;
  state.jumpRaf = requestAnimationFrame(() => {
    state.jumpRaf = null;
    updateJumpUiFromScroll(state);
  });
}

function scheduleScrollIdleWork(state: ScrollSideEffectsState): void {
  if (state.idleRaf != null) return;
  state.idleRaf = requestAnimationFrame(() => {
    state.idleRaf = null;
    flushScrollSideEffects(state);
  });
}

/** Load-older eligibility + jump FAB state; virtualizer reads happen here, not in scroll. */
function flushScrollSideEffects(state: ScrollSideEffectsState): void {
  const opts = state.options;
  opts.emitSeenMessageId(opts.resolveSeenMessageId());
  if (opts.prependTransactionActive.value) {
    logMessageListThrottled(
      'flush_skip_prepend',
      250,
      'scroll',
      'scroll_idle_flush_skipped',
      {
        reason: 'prepend_transaction_active',
        activeTxId: opts.activePrependTxId.value,
      },
    );
    return;
  }
  const el = opts.getContainer();
  const scrollTop = el?.scrollTop;
  opts.runLoadOlderIfEligible();
  runLoadNewerIfEligible(state);
  updateJumpUiFromScroll(state);
  logMessageListThrottled(
    'scroll_idle_flush',
    400,
    'scroll',
    'scroll_idle_flush',
    {
      scrollTop,
      direction: state.observation.direction,
      distFromBottomPx: opts.distanceFromBottomPx(),
      jumpScrollAway: opts.jumpUi.scrollAwayFromBottom.value,
      jumpPendingNew: opts.jumpUi.pendingNewWhileAway.value,
      nearTopWillConsiderLoadOlder: (scrollTop ?? 0) <= opts.nearTopPx,
      expectation:
        'after flush: jump UI reflects viewport; load older may run if gated conditions pass',
    },
  );
  opts.schedulePersistViewportMemory();
}

/** Load the next page when a target-centered window is scrolled back toward present. */
function runLoadNewerIfEligible(state: ScrollSideEffectsState): void {
  const opts = state.options;
  const el = opts.getContainer();
  if (!el || !opts.canLoadNewer()) return;
  if (opts.distanceFromBottomPx() > opts.nearBottomPx) return;
  if (state.observation.direction !== 'down') return;
  void opts.loadNewer();
}

/**
 * Scroll listener: cheap state only (position, direction, user-scroll window).
 * Heavy follow-up is coalesced via {@link scheduleScrollIdleWork}.
 */
function onScrollCombined(state: ScrollSideEffectsState): void {
  const opts = state.options;
  const t0 = opts.nowMs();
  const el = opts.getContainer();
  const nextScrollTop = el?.scrollTop ?? 0;
  state.observation.direction = getScrollDirection(
    state.observation.scrollTop,
    nextScrollTop,
  );
  opts.noteWheelDirection(state.observation.direction);
  state.observation.scrollTop = nextScrollTop;
  if (opts.prependTransactionActive.value) return;
  const scrollClassification = opts.noteScrollEvent();
  // Only defer embed hydration / heavy remeasure for genuine user scrolls —
  // programmatic compensation and initialOffset echoes must not keep embeds hidden.
  if (scrollClassification === 'user') {
    opts.markScrollHydrationDeferral();
  }
  scheduleScrollIdleWork(state);
  const handlerMs = opts.nowMs() - t0;
  messageListScrollMetricsApi()?.noteScrollHandlerDuration(handlerMs);
  if (handlerMs > 16.7) {
    messageListScrollMetricsApi()?.noteLongFrame(handlerMs);
  }
}

/**
 * Genuine user input gestures (wheel, touch, navigation keys) unambiguously mean
 * the user is driving — claim scroll ownership even during initial load so the
 * one-shot anchor / viewport restore yields instead of yanking them back.
 */
function onUserScrollGesture(state: ScrollSideEffectsState): void {
  if (state.options.prependTransactionActive.value) return;
  state.options.markUserGesture();
  state.options.markScrollHydrationDeferral();
}

function onKeydownScrollGesture(
  state: ScrollSideEffectsState,
  event: KeyboardEvent,
): void {
  if (!NAVIGATION_SCROLL_KEYS.has(event.key)) return;
  onUserScrollGesture(state);
}

/** Wheel at scrollTop≈0 does not emit scroll events — treat as upward pagination intent. */
function onWheelNearTopForLoadOlder(
  state: ScrollSideEffectsState,
  event: WheelEvent,
): void {
  const opts = state.options;
  const el = opts.getContainer();
  if (!el || opts.prependTransactionActive.value) return;
  if (event.deltaY >= 0) return;
  if (el.scrollTop > opts.nearTopPx) return;
  state.observation.direction = 'up';
  scheduleScrollIdleWork(state);
}

/**
 * USER-INTENT SCROLL: jump-to-latest FAB. Direct user action — always authorized
 * by scroll ownership. See MessageList for the other surviving programmatic writes.
 */
function jumpToLatestMessages(state: ScrollSideEffectsState): void {
  const opts = state.options;
  opts.followNewMessagesToBottom.value = true;
  opts.jumpUi.pendingNewWhileAway.value = 0;
  opts.scrollToBottom(true, 'user-intent');
  requestAnimationFrame(() => {
    scheduleJumpUiFromScroll(state);
  });
}

function applyPendingNewDelta(
  state: ScrollSideEffectsState,
  delta: number,
): void {
  const opts = state.options;
  const orderedIds = opts.getDisplayOrderedIds();
  const totalMsgs = orderedIds.length;
  const virtualItems = opts.getVirtualizer()?.getVirtualItems() ?? [];
  const lastVisibleIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1]!.index
      : totalMsgs - 1;
  const hiddenFromBottom = Math.max(0, totalMsgs - 1 - lastVisibleIndex);
  if (hiddenFromBottom < opts.bottomJumpShowMessages) return;
  opts.jumpUi.pendingNewWhileAway.value += delta;
}

function installPendingNewWhileAwayWatch(state: ScrollSideEffectsState): void {
  const opts = state.options;
  watch(
    () =>
      [
        opts.getDisplayOrderedIds().length,
        opts.getDisplayOrderedIds().at(-1),
      ] as const,
    ([len, tailId], prev) => {
      if (opts.prependTransactionActive.value) return;
      if (!prev) return;
      const [prevLen, prevTail] = prev;
      if (len <= prevLen) return;
      if (tailId === prevTail) return;
      if (opts.suppressListUntilInitialAnchor.value) return;
      const lastMsgId = opts.getDisplayOrderedIds()[len - 1];
      const lastMsg = lastMsgId ? opts.getMessages().get(lastMsgId) : undefined;
      if (
        lastMsg &&
        isEchoMessageLogicallyOwn(
          lastMsg,
          opts.getCurrentUserId(),
          opts.getLinkedDiscordUserId(),
        )
      ) {
        return;
      }
      void nextTick(() => {
        requestAnimationFrame(() => {
          applyPendingNewDelta(state, len - prevLen);
        });
      });
    },
  );
}

function installSuppressRevealJumpUiWatch(state: ScrollSideEffectsState): void {
  watch(state.options.suppressListUntilInitialAnchor, (hidden) => {
    if (hidden) return;
    void nextTick(() => {
      updateJumpUiFromScroll(state);
    });
  });
}

function disposeScrollSideEffects(state: ScrollSideEffectsState): void {
  if (state.jumpRaf != null) {
    cancelAnimationFrame(state.jumpRaf);
    state.jumpRaf = null;
  }
  if (state.idleRaf != null) {
    cancelAnimationFrame(state.idleRaf);
    state.idleRaf = null;
  }
}

export function useMessageListScrollSideEffects(
  options: UseMessageListScrollSideEffectsOptions,
) {
  const state: ScrollSideEffectsState = {
    jumpRaf: null,
    idleRaf: null,
    observation: options.scrollObservation,
    options,
  };

  installPendingNewWhileAwayWatch(state);
  installSuppressRevealJumpUiWatch(state);

  return {
    updateJumpUiFromScroll: () => updateJumpUiFromScroll(state),
    scheduleJumpUiFromScroll: () => scheduleJumpUiFromScroll(state),
    scheduleScrollIdleWork: () => scheduleScrollIdleWork(state),
    flushScrollSideEffects: () => flushScrollSideEffects(state),
    onScrollCombined: () => onScrollCombined(state),
    onUserScrollGesture: () => onUserScrollGesture(state),
    onKeydownScrollGesture: (event: KeyboardEvent) =>
      onKeydownScrollGesture(state, event),
    onWheelNearTopForLoadOlder: (event: WheelEvent) =>
      onWheelNearTopForLoadOlder(state, event),
    jumpToLatestMessages: () => jumpToLatestMessages(state),
    dispose: () => disposeScrollSideEffects(state),
  };
}
