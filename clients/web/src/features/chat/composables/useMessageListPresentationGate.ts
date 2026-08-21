/**
 * Message list — **loading / presentation-gate authority**.
 *
 * Owns warm/cold channel-open stamping and the single overlay readiness signal.
 * Does not own scroll writes, prepend TX, or row measurement.
 *
 * Decide warm/cold once at {@link beginChannelTransition}. Do not reclassify
 * mid-transition from reactive chrome flags.
 */

import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { decideMessageListChannelWarm } from '@/features/chat/domain/messageListWarmCold';
import type { MessageListViewportSnapshot } from '@/features/chat/composables/messageListViewportStorage';
import { logMessageList } from '@/features/chat/composables/messageListDebugLog';

/** Failsafe: never leave the cold-load overlay up if anchor work stalls. */
export const INITIAL_ANCHOR_OVERLAY_SAFETY_MS = 2500;

export type UseMessageListPresentationGateOptions = {
  channelId: () => string | undefined;
  initialHistoryLoading: () => boolean;
  isEmpty: Ref<boolean> | ComputedRef<boolean>;
  displayOrderedIds: Ref<readonly string[]> | ComputedRef<readonly string[]>;
  /** True while MessageList is waiting for the first initial anchor. */
  isSuppressingUntilInitialAnchor: () => boolean;
  /**
   * Safety-timeout side effects owned by MessageList (suppress flag + scroll
   * ownership settle). Presentation ready is flipped by this module first.
   */
  onSafetyRelease: () => void;
  getActiveWindowChannelId: () => string | null;
  getWindowOrderedIds: () => readonly string[];
  readSavedViewport: (channelId: string) => MessageListViewportSnapshot | null;
};

type GateState = {
  channelOpenWarm: Ref<boolean>;
  channelOpenWarmChannelId: Ref<string | null>;
  listPresentationReady: Ref<boolean>;
  safetyTimer: { current: ReturnType<typeof setTimeout> | null };
  options: UseMessageListPresentationGateOptions;
};

function markListPresentationReady(state: GateState, reason: string): void {
  if (state.listPresentationReady.value) return;
  state.listPresentationReady.value = true;
  logMessageList('initial_anchor', 'list_presentation_ready', {
    channelId: state.options.channelId() ?? null,
    reason,
    warm: state.channelOpenWarm.value,
  });
}

function disarmInitialAnchorOverlaySafety(state: GateState): void {
  if (state.safetyTimer.current != null) {
    clearTimeout(state.safetyTimer.current);
    state.safetyTimer.current = null;
  }
}

function armInitialAnchorOverlaySafety(
  state: GateState,
  channelId: string | null,
): void {
  disarmInitialAnchorOverlaySafety(state);
  if (!channelId) return;
  state.safetyTimer.current = setTimeout(() => {
    state.safetyTimer.current = null;
    if (!state.options.isSuppressingUntilInitialAnchor()) return;
    logMessageList('initial_anchor', 'initial_anchor_overlay_safety_release', {
      channelId,
      messageCount: state.options.displayOrderedIds.value.length,
      initialHistoryLoading: state.options.initialHistoryLoading(),
      outcomeOk: false,
      expectation:
        'overlay released after safety timeout — anchor should have settled sooner',
    });
    markListPresentationReady(state, 'safety_timeout');
    state.options.onSafetyRelease();
  }, INITIAL_ANCHOR_OVERLAY_SAFETY_MS);
}

function beginChannelTransition(
  state: GateState,
  cid: string | undefined | null,
): void {
  const trimmed = cid?.trim() ?? '';
  const activeWindow = state.options.getActiveWindowChannelId();
  const windowMatches = !activeWindow || activeWindow === trimmed;
  const decision = decideMessageListChannelWarm({
    channelId: trimmed || null,
    windowChannelId: windowMatches ? trimmed || null : activeWindow,
    orderedIds: windowMatches ? state.options.getWindowOrderedIds() : [],
    savedViewport: trimmed ? state.options.readSavedViewport(trimmed) : null,
  });
  state.channelOpenWarm.value = decision.warm;
  state.channelOpenWarmChannelId.value = decision.channelId || null;
  state.listPresentationReady.value = decision.warm || !trimmed;
  logMessageList('lifecycle', 'channel_warm_cold_decision', {
    channelId: decision.channelId || null,
    warm: decision.warm,
    reason: decision.reason,
    orderedCount: state.options.getWindowOrderedIds().length,
    windowChannelId: activeWindow,
    windowMatches,
  });
  if (cid) armInitialAnchorOverlaySafety(state, cid);
  else disarmInitialAnchorOverlaySafety(state);
}

function tryMarkColdWindowUsable(state: GateState): void {
  if (state.listPresentationReady.value || state.channelOpenWarm.value) return;
  const cid = state.options.channelId()?.trim() ?? '';
  if (!cid || state.channelOpenWarmChannelId.value !== cid) return;
  if (state.options.displayOrderedIds.value.length === 0) return;
  const activeWindow = state.options.getActiveWindowChannelId();
  if (activeWindow && activeWindow !== cid) return;
  const saved = state.options.readSavedViewport(cid);
  if (
    saved &&
    !saved.followNewMessages &&
    !state.options.displayOrderedIds.value.includes(saved.anchorMessageId)
  ) {
    return;
  }
  markListPresentationReady(state, 'cold_window_usable');
}

export function useMessageListPresentationGate(
  options: UseMessageListPresentationGateOptions,
) {
  const state: GateState = {
    channelOpenWarm: ref(false),
    channelOpenWarmChannelId: ref<string | null>(null),
    listPresentationReady: ref(true),
    safetyTimer: { current: null },
    options,
  };

  const showEmptyHistorySkeleton = computed(
    () =>
      options.isEmpty.value &&
      options.initialHistoryLoading() &&
      !!options.channelId() &&
      isEchoGraphId(options.channelId()!),
  );

  const showInitialLoadOverlay = computed(() => {
    if (showEmptyHistorySkeleton.value) return true;
    const cid = options.channelId()?.trim();
    if (!cid || state.channelOpenWarm.value) return false;
    if (state.listPresentationReady.value) return false;
    if (options.isEmpty.value) return false;
    return state.channelOpenWarmChannelId.value === cid;
  });

  watch(
    () =>
      [
        options.channelId(),
        options.displayOrderedIds.value.length,
        options.displayOrderedIds.value[0] ?? '',
        options.displayOrderedIds.value.at(-1) ?? '',
      ] as const,
    () => tryMarkColdWindowUsable(state),
  );

  return {
    channelOpenWarm: state.channelOpenWarm,
    channelOpenWarmChannelId: state.channelOpenWarmChannelId,
    listPresentationReady: state.listPresentationReady,
    showEmptyHistorySkeleton,
    showLoadingSkeleton: showEmptyHistorySkeleton,
    showInitialLoadOverlay,
    markListPresentationReady: (reason: string) =>
      markListPresentationReady(state, reason),
    disarmInitialAnchorOverlaySafety: () =>
      disarmInitialAnchorOverlaySafety(state),
    beginChannelTransition: (cid: string | undefined | null) =>
      beginChannelTransition(state, cid),
  };
}
