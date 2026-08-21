<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  computed,
  provide,
  inject,
  type InjectionKey,
} from 'vue';
import type { MessageWithAuthor, EchoChannelType } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import MessageBubble from './MessageBubble.vue';
import MessageListHistorySkeleton from './MessageListHistorySkeleton.vue';
import MessageListHistorySkeletonRow from './MessageListHistorySkeletonRow.vue';
import MessageListOlderFetchLoadingHeader from './MessageListOlderFetchLoadingHeader.vue';
import { useMessageListOlderFetchSkeleton } from '@/features/chat/domain/messageListOlderFetchSkeleton';
import { triggerInitialBackfillAfterAnchor } from '@/features/chat/composables/triggerInitialBackfillAfterAnchor';
import MessageListJumpFab from './MessageListJumpFab.vue';
import {
  createMessageListJumpUi,
  MESSAGE_LIST_JUMP_UI_KEY,
} from '@/features/chat/domain/messageListJumpUi';
import type {
  MemberRole,
  PopoutAnchorRect,
} from '@/features/member-profile/memberProfiles';
import { isClientOnlyDmOpenShellChannelId } from '@/features/dm/dmOpenShellChannelId';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import {
  noteSubtractionBeginChannelSwitch,
  noteSubtractionScrollWrite,
} from '@/features/chat/domain/messageListSubtractionDiagnostics';
import {
  ANCHOR_DRIFT_THRESHOLD_PX,
  getAnchorMessageIdFromViewport,
  isAtScrollTopCeiling,
  measureMessageTopInContainer,
  restorePrependScroll,
  type PrependSnapshot,
} from '@/features/chat/domain/messageListPrependAnchor';
import {
  flushMessageListViewportStorage,
  readMessageListViewport,
} from '@/features/chat/composables/messageListViewportStorage';
import { useMessageListPresentationGate } from '@/features/chat/composables/useMessageListPresentationGate';
import { useMessageListRowMeasure } from '@/features/chat/composables/useMessageListRowMeasure';
import { useMessageListRowPresentations } from '@/features/chat/composables/useMessageListRowPresentations';
import { useMessageListScrollSideEffects } from '@/features/chat/composables/useMessageListScrollSideEffects';
import { useMessageListVirtualRowObservation } from '@/features/chat/composables/useMessageListVirtualRowObservation';
import { useMessageListViewportMemory } from '@/features/chat/composables/useMessageListViewportMemory';
import { useMessageListEmptyChrome } from '@/features/chat/composables/useMessageListEmptyChrome';
import { useMessageListDmCallRollup } from '@/features/chat/composables/useMessageListDmCallRollup';
import { useMessageListDevDiagnostics } from '@/features/chat/composables/useMessageListDevDiagnostics';
import { useMessageListVirtualizer } from '@/features/chat/composables/useMessageListVirtualizer';
import { useMessageListRowGeometry } from '@/features/chat/composables/useMessageListRowGeometry';
import { createMessageListBubbleActionHandlers } from '@/features/chat/composables/useMessageListBubbleActionHandlers';
import MessageListEmptyStates from './MessageListEmptyStates.vue';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  downwardOnlySnapScrollTop,
  shouldSkipScrollToIndexForLatest,
} from '@/features/chat/domain/messageListScrollSnap';
import {
  createMessageListScrollOwnership,
  type ScrollIntent,
} from '@/features/chat/domain/messageListScrollOwnership';
import {
  logMessageList,
  logMessageListThrottled,
  messageListDebugEnabled,
} from '@/features/chat/composables/messageListDebugLog';
import { dbgReadState } from '@/features/layout/echoReadStateDebug';
import { isEchoMessageLogicallyOwn } from '@/features/chat/domain/discordTwinMessageOwnership';
import { useCoarsePointer } from '@/features/chat/useCoarsePointer';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import DmHistoryIntroCard from './DmHistoryIntroCard.vue';
import { MESSAGE_LIST_COMPENSATION_ANCHOR_RECONCILE } from '@/features/chat/domain/messageListScrollPolicy';
import {
  createScrollCompensationController,
  type ScrollCompensationAnchor,
} from '@/features/chat/domain/messageListScrollCompensation';
import {
  installMessageListScrollMetrics,
  isMessageListScrollMetricsEnabled,
  messageListScrollMetricsApi,
} from '@/features/chat/composables/messageListScrollMetrics';
import {
  MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY,
  MESSAGE_LIST_SCROLL_SURFACE_KEY,
  type MessageListScrollSurfaceApi,
} from '@/features/chat/composables/messageListScrollGestureKeys';

/** Viewport laws (authority, anchors, keys, scroll vs meaning): `@/features/chat/domain/viewportContract`. */
/** Layer-2 perf checklist (containment, caches, passive scroll): `@/features/chat/domain/messageListMicroPerf`. */

const props = defineProps<{
  messages: Map<string, MessageWithAuthor & { channelName?: string }>;
  /** When true, add top padding for overlayed channel header; use false when chat has its own header (e.g. voice side chat) */
  hasChannel?: boolean;
  /**
   * Override the default overlay-header top inset (px) for the scroll container + virtualizer padding.
   * Used when the shell renders a taller global header than the normal `h-12` strip.
   */
  headerOverlayInsetPx?: number;
  /** When true, use minimal top padding (no header offset) */
  compactTop?: boolean;
  channelId?: string;
  /** Current server id for role-colored author names */
  serverId?: string;
  resolveAuthorRole?: (userId: string) => MemberRole;
  currentUserId?: string;
  linkedDiscordUserId?: string | null;
  currentUserName?: string;
  resolvePollVoterDisplay?: (userId: string) => string;
  resolvePollVoterAvatar?: (userId: string) => string | undefined;
  onPollVote?: (messageId: string, optionId: string) => void;
  onFillImageSlot?: (
    messageId: string,
    slotId: string,
    body: {
      imageUrl: string;
      storageKey?: string;
      width?: number;
      height?: number;
    },
  ) => boolean | void | Promise<boolean | void>;
  onDelete?: (messageId: string) => void;
  onReply?: (message: MessageWithAuthor) => void;
  onEdit?: (message: MessageWithAuthor) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onGoToChannel?: (channelId: string) => void;
  onGoToMessage?: (channelId: string, messageId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  onOpenProfileFromContextMenu?: (userId: string) => void;
  pinnedMessageIds?: string[];
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  canModerateAuthor?: (authorId: string) => boolean;
  onModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  loadOlder?: () => Promise<boolean>;
  loadNewer?: () => Promise<boolean>;
  loadInitialBackfill?: () => Promise<boolean>;
  initialBackfillLoading?: boolean;
  initialBackfillPending?: boolean;
  /**
   * Ensure a message id is present in the loaded window (e.g. prefetch for saved scroll restore).
   */
  ensureMessageInWindow?: (messageId: string) => Promise<boolean>;
  loadingOlder?: boolean;
  loadingNewer?: boolean;
  /** Echo: while first page of history loads for an empty UUID channel, show message-shaped skeletons. */
  initialHistoryLoading?: boolean;
  /** Navigation-level loading (e.g. DM thread opening) before channel id/history resolve. */
  transitionLoading?: boolean;
  /** Guild shell still hydrating (channel tree / active channel) — suppress empty copy. */
  guildShellSettling?: boolean;
  /** Servers rail with no joinable guild / channel chrome (empty onboarding) — show CTA instead of generic empty channel copy. */
  noServersYet?: boolean;
  onOpenExplore?: () => void;
  isDiscordImportedServer?: boolean;
  discordChannelId?: string;
  channelName?: string;
  /** When `voice`, Discord message import is not offered (voice side chat / voice channels). */
  channelType?: EchoChannelType;
  /** True when viewing a forum post channel (child thread channel under a forum). */
  isForumPostChannel?: boolean;
  /** Server owner / manage-server only — empty-channel Discord import CTA. */
  canShowDiscordChannelImport?: boolean;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  firstUnreadMessageId?: string | null;
  /** When set, read/unread follows this cursor in list chronological order (see `resolveEchoMessageReadStateForMessageList`). */
  lastReadMessageId?: string | null;
  /**
   * When false, omit the “New” unread divider strip. ChatView keeps this off (including DMs / group chats).
   */
  showUnreadSeparator?: boolean;
  dmHistoryIntro?: {
    title: string;
    subtitle: string;
    avatarUrl?: string;
    presenceStatus?: string;
    presenceMobileSurface?: boolean;
    hidePresence?: boolean;
    mutualCommunitiesCount?: number;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void | Promise<void>;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'imported'): void;
  (e: 'seen-message-id-changed', messageId: string | null): void;
}>();

/** Isolated from list row render: scroll handlers mutate; only MessageListJumpFab reads. */
const jumpUi = createMessageListJumpUi();
provide(MESSAGE_LIST_JUMP_UI_KEY, jumpUi);

const coarsePointer = useCoarsePointer();
/** WebKit drops aggressively unmounted virtual rows during fast scroll. */
const safariLikeBrowser = isSafariLikeBrowser();

async function forwardFillImageSlot(
  messageId: string,
  slotId: string,
  body: {
    imageUrl: string;
    storageKey?: string;
    width?: number;
    height?: number;
  },
): Promise<boolean> {
  const fn = props.onFillImageSlot;
  if (!fn) return false;
  const r = await Promise.resolve(fn(messageId, slotId, body));
  return r !== false;
}

function forwardBubbleDelete(messageId: string) {
  props.onDelete?.(messageId);
}

function forwardBubbleReply(message: MessageWithAuthor) {
  props.onReply?.(message);
}

function forwardBubbleEdit(message: MessageWithAuthor) {
  props.onEdit?.(message);
}

/** Canonical ids from `messageWindowAuthority` (before DM call-log folding). */
const {
  canonicalOrderedIds,
  displayOrderedIds,
  mergedEntitiesForList,
  mergedMessagesForList,
  revealDmCallRunContainingMessageIfCollapsed,
  handleExpandDmCallRollFromBubble,
} = useMessageListDmCallRollup({
  channelId: () => props.channelId,
  messages: () => props.messages,
});

const USER_SCROLL_SETTLE_MS = 180;
const deferFullRowHydration = ref(false);
let hydrationSettleTimer: ReturnType<typeof setTimeout> | null = null;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const scrollOwnership = createMessageListScrollOwnership({
  now: nowMs,
  userScrollSettleMs: USER_SCROLL_SETTLE_MS,
});

const scrollCompensation = createScrollCompensationController({ now: nowMs });
const scrollGestureActive = ref(false);
provide(MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY, scrollGestureActive);

const scrollSurfaceApi = inject<MessageListScrollSurfaceApi | null>(
  MESSAGE_LIST_SCROLL_SURFACE_KEY as InjectionKey<MessageListScrollSurfaceApi | null>,
  null,
);

function syncScrollGestureSurface(active: boolean): void {
  scrollGestureActive.value = active;
  scrollSurfaceApi?.setScrollGestureActive(active);
}

let captureScrollCompensationAnchorImpl: (() => void) | null = null;
function captureScrollCompensationAnchor(): void {
  captureScrollCompensationAnchorImpl?.();
}

let applyAnchorReconcileAtSettleImpl: (() => void) | null = null;
function applyAnchorReconcileAtSettle(): void {
  applyAnchorReconcileAtSettleImpl?.();
}

let scheduleContentPatchRemeasureImpl: (
  messageIds: readonly string[],
) => void = () => {};
function scheduleContentPatchRemeasure(messageIds: readonly string[]): void {
  scheduleContentPatchRemeasureImpl(messageIds);
}

const {
  messageListRowPresentations,
  flushPendingRowFactsAfterScrollSettle,
  clearUnreadBoundaryMemory,
} = useMessageListRowPresentations({
  displayOrderedIds,
  mergedEntitiesForList,
  mergedMessagesForList,
  compactTop: () => !!props.compactTop,
  firstUnreadMessageId: () => props.firstUnreadMessageId ?? null,
  lastReadMessageId: () => props.lastReadMessageId ?? null,
  showUnreadSeparator: () => props.showUnreadSeparator !== false,
  isUserScrollActive: () => scrollOwnership.isUserActive(),
  onPatchedRows: (messageIds) => scheduleContentPatchRemeasure(messageIds),
});

/** True when there is nothing to scroll (canonical channel window — rollup does not invent messages). */
const isEmpty = computed(() => canonicalOrderedIds.value.length === 0);

/**
 * True from channel-change until the first anchor settles. The list still renders and
 * measures underneath (never gate the list's existence on this — it would unmount the
 * virtualizer). Overlay visibility is separate: see {@link listPresentationReady}.
 */
const suppressListUntilInitialAnchor = ref(false);

const {
  showLoadingSkeleton,
  showInitialLoadOverlay,
  markListPresentationReady,
  disarmInitialAnchorOverlaySafety,
  beginChannelTransition,
} = useMessageListPresentationGate({
  channelId: () => props.channelId,
  initialHistoryLoading: () => !!props.initialHistoryLoading,
  isEmpty,
  displayOrderedIds,
  isSuppressingUntilInitialAnchor: () => suppressListUntilInitialAnchor.value,
  onSafetyRelease: () => {
    suppressListUntilInitialAnchor.value = false;
    scrollOwnership.markInitialAnchorSettled();
  },
  getActiveWindowChannelId: () => messageWindowAuthority.getActiveChannelId(),
  getWindowOrderedIds: () => messageWindowAuthority.orderedIds.value,
  readSavedViewport: (cid) => readMessageListViewport(cid),
});

const {
  showNoServersYet,
  discordMessageImportEligible,
  showEmptyChannelHint,
  showDiscordImportWidget,
  showDmHistoryIntro,
  showsBlockingEmptyChrome,
  scrollContainerPaddingTopPx,
  scrollContainerPaddingBottomClass,
} = useMessageListEmptyChrome({
  isEmpty,
  showLoadingSkeleton,
  noServersYet: () => !!props.noServersYet,
  guildShellSettling: () => !!props.guildShellSettling,
  dmHistoryIntro: () => props.dmHistoryIntro,
  serverId: () => props.serverId,
  canShowDiscordChannelImport: () => !!props.canShowDiscordChannelImport,
  isDiscordImportedServer: () => !!props.isDiscordImportedServer,
  discordChannelId: () => props.discordChannelId,
  channelType: () => props.channelType,
  compactTop: () => !!props.compactTop,
  hasChannel: () => !!props.hasChannel,
  headerOverlayInsetPx: () => props.headerOverlayInsetPx,
  coarsePointer,
});

const activeChannelIndex = computed(() => {
  const cid = props.channelId?.trim();
  return cid;
});

const pinnedIdSet = computed(() => new Set(props.pinnedMessageIds ?? []));

const NEAR_BOTTOM_PX = 150;
const FOLLOW_NEW_DETACH_PX = 280;
const FOLLOW_NEW_ATTACH_PX = 80;
const NEAR_TOP_PX = 120;
const BOTTOM_JUMP_SHOW_MESSAGES = 30;

function withProgrammaticScroll<T>(
  write: () => T,
  intent?: ScrollIntent | string,
): T {
  if (intent) noteSubtractionScrollWrite(String(intent));
  scrollOwnership.beginProgrammaticWrite();
  return write();
}

/**
 * Hard invariant: while the user is actively scrolling (or within the post-scroll
 * settle window), no code path may programmatically correct scroll position.
 * Backed by {@link scrollOwnership} so there is one definition of "user is active".
 */
function isUserScrollProtected(
  scrollDirection: 'forward' | 'backward' | null = null,
): boolean {
  if (scrollDirection !== null) return true;
  return scrollOwnership.isUserActive();
}

/** Whether new messages should pull the viewport to the latest (bottom-anchored channels). */
const followNewMessagesToBottom = ref(true);

/** Shared with virtualizer compensation + scroll side-effects composable. */
const scrollObservation: {
  scrollTop: number;
  direction: 'up' | 'down' | 'still';
} = {
  scrollTop: 0,
  direction: 'still',
};

let suppressLoadOlderUntilLeaveTopZone = false;
/** Bumps on channel change and each `applyInitialScrollAnchor` call — stale rAF work bails (max one commit pass wins). */
let initialAnchorScheduleGeneration = 0;

/** Filled by {@link useMessageListRowMeasure} once deps below are ready. */
let clearDeferredResizeKeys: () => void = () => {};
let scheduleVirtualRowMeasure: (
  element: Element,
  source: 'ref' | 'resize',
  options?: { force?: boolean },
) => void = () => {};
let flushDeferredRowResizeMeasures: () => void = () => {};
let clearMeasureStateForChannelSwitch: () => void = () => {};
let resizeDeferMetrics = {
  resizeObserverCallbackCount: 0,
  measureNowCount: 0,
  measureDeferredCount: 0,
  deferredKeysAtSettle: 0,
  settleFlushDurationMs: 0,
  settleFlushDurationMaxMs: 0,
};
let unresolvedResizeDeltaByKey = new Map<string, number>();
let measureRowLastHeightByKey = new Map<string, number>();
let rowResizeMeasureDeferredKeys = new Set<string>();

const prependTransactionActive = ref(false);
/** Virtualizer skeleton slots above the live window while `loadOlder` fetches. */
const olderFetchSkeletonActive = ref(false);
const {
  olderHistorySkeletonRows,
  virtualizerOrderedIds,
  isPrependSkeletonVirtualIndex,
  virtualIndexToMessageIndex,
  estimatePrependSkeletonRowSizePx,
} = useMessageListOlderFetchSkeleton({
  olderFetchSkeletonActive,
  displayOrderedIds,
  mergedEntitiesForList,
  propsMessages: computed(() => props.messages),
  currentUserId: computed(() => props.currentUserId),
  channelId: computed(() => props.channelId),
});

function messageIdForVirtualIndex(virtualIndex: number): string | null {
  if (isPrependSkeletonVirtualIndex(virtualIndex)) return null;
  const messageIndex = virtualIndexToMessageIndex(virtualIndex);
  return displayOrderedIds.value[messageIndex]?.trim() || null;
}

const {
  virtualRowElementByKey,
  disconnectRowResizeObserver,
  syncVirtualRowResizeObservation,
  detachVirtualRowResizeObservation,
  measureKeyForElement,
} = useMessageListVirtualRowObservation({
  getChannelId: () => props.channelId?.trim() ?? '',
  messageIdForVirtualIndex,
  scheduleVirtualRowMeasure: (element, source) =>
    scheduleVirtualRowMeasure(element, source),
  getResizeDeferMetrics: () => resizeDeferMetrics,
  getUnresolvedResizeDeltaByKey: () => unresolvedResizeDeltaByKey,
  getMeasureRowLastHeightByKey: () => measureRowLastHeightByKey,
  clearDeferredResizeKeys: () => clearDeferredResizeKeys(),
});

const activePrependTxId = ref(0);
const activePrependChannelId = ref<string | null>(null);
let nextPrependTxId = 0;
let lastEmittedSeenMessageId: string | null | undefined = undefined;

function resolveSeenMessageId(): string | null {
  const el = containerRef.value;
  const virtualItems = virtualizer.value?.getVirtualItems() ?? [];
  if (!el || displayOrderedIds.value.length === 0) {
    return null;
  }
  if (virtualItems.length === 0) {
    // Initial render race: rows exist but virtualizer has not published visible items yet.
    // Fall back to the newest message so "visible on open" can still advance read state.
    return displayOrderedIds.value[displayOrderedIds.value.length - 1] ?? null;
  }
  return (
    getAnchorMessageIdFromViewport(
      el,
      virtualItems,
      displayOrderedIds.value,
      props.messages,
    )?.anchorMessageId ?? null
  );
}

function emitSeenMessageId(next: string | null): void {
  if (lastEmittedSeenMessageId === next) return;
  lastEmittedSeenMessageId = next;
  dbgReadState('message_list_emit_seen_message_id', {
    channelId: props.channelId ?? null,
    seenMessageId: next,
  });
  emit('seen-message-id-changed', next);
}

function distanceFromBottomPx(): number {
  const el = containerRef.value;
  const v = virtualizer.value;
  if (!el || !v) return 0;
  return Math.max(0, v.getTotalSize() - el.scrollTop - el.clientHeight);
}

/**
 * Bound after {@link commitScrollToLatest} is defined — restore injects this
 * without moving the hot follow-tail path into viewport memory.
 */
let commitScrollToLatestForViewportMemory: (options: {
  smooth?: boolean;
  forceScrollToIndex?: boolean;
  intent?: ScrollIntent;
}) => void = () => {};

const {
  persistViewportMemoryForChannel,
  schedulePersistViewportMemory,
  restoreViewportMemoryForChannel,
  dispose: disposeViewportMemory,
} = useMessageListViewportMemory({
  getContainer: () => containerRef.value,
  getVirtualizer: () => virtualizer.value,
  getChannelId: () => props.channelId,
  getDisplayOrderedIds: () => displayOrderedIds.value,
  getMessages: () => props.messages,
  getEnsureMessageInWindow: () => props.ensureMessageInWindow,
  followNewMessagesToBottom,
  isSuppressingUntilInitialAnchor: () => suppressListUntilInitialAnchor.value,
  canCommitViewportRestore: () => scrollOwnership.canCommit('viewport-restore'),
  withProgrammaticScroll,
  commitScrollToLatest: (options) =>
    commitScrollToLatestForViewportMemory(options),
  distanceFromBottomPx,
  followNewAttachPx: FOLLOW_NEW_ATTACH_PX,
});

/** Bound after load-older / hydration / scrollToBottom exist. */
let runLoadOlderIfEligibleForScroll: () => void = () => {};
let markScrollHydrationDeferralForScroll: () => void = () => {};
let scrollToBottomForJump: (
  smooth?: boolean,
  intent?: ScrollIntent,
) => void = () => {};

const {
  updateJumpUiFromScroll,
  onScrollCombined,
  onUserScrollGesture,
  onKeydownScrollGesture,
  onWheelNearTopForLoadOlder,
  jumpToLatestMessages,
  dispose: disposeScrollSideEffects,
} = useMessageListScrollSideEffects({
  getContainer: () => containerRef.value,
  getVirtualizer: () => virtualizer.value,
  getDisplayOrderedIds: () => displayOrderedIds.value,
  getMessages: () => props.messages,
  getCurrentUserId: () => props.currentUserId,
  getLinkedDiscordUserId: () => props.linkedDiscordUserId,
  jumpUi,
  followNewMessagesToBottom,
  prependTransactionActive,
  activePrependTxId,
  suppressListUntilInitialAnchor,
  distanceFromBottomPx,
  nearBottomPx: NEAR_BOTTOM_PX,
  nearTopPx: NEAR_TOP_PX,
  followNewDetachPx: FOLLOW_NEW_DETACH_PX,
  followNewAttachPx: FOLLOW_NEW_ATTACH_PX,
  bottomJumpShowMessages: BOTTOM_JUMP_SHOW_MESSAGES,
  nowMs,
  noteWheelDirection: (direction) =>
    scrollCompensation.noteWheelDirection(direction),
  noteScrollEvent: () => scrollOwnership.noteScrollEvent(),
  markUserGesture: () => scrollOwnership.markUserGesture(),
  markScrollHydrationDeferral: () => markScrollHydrationDeferralForScroll(),
  runLoadOlderIfEligible: () => runLoadOlderIfEligibleForScroll(),
  canLoadNewer: () =>
    !!props.loadNewer &&
    !props.loadingNewer &&
    messageWindowAuthority.hasMoreNewer.value !== false,
  loadNewer: () => {
    void props.loadNewer?.();
  },
  resolveSeenMessageId,
  emitSeenMessageId,
  schedulePersistViewportMemory,
  scrollToBottom: (smooth, intent) => scrollToBottomForJump(smooth, intent),
  scrollObservation,
});

const containerRef = ref<HTMLElement | null>(null);

/** Caller-owned measure commit; assigned after estimate/logging helpers exist. */
let commitVirtualRowMeasure: (
  element: Element,
  source: 'ref' | 'resize',
) => void = () => {};

const rowMeasure = useMessageListRowMeasure({
  getChannelId: () => props.channelId?.trim() ?? '',
  isUserScrollActive: () => scrollOwnership.isUserActive(),
  deferFullRowHydration: () => deferFullRowHydration.value,
  prependTransactionActive: () => prependTransactionActive.value,
  getRowMeasureGeometry: (element) => {
    const scrollEl = containerRef.value;
    if (!scrollEl) {
      return {
        rowTopInContainerPx: null,
        rowBottomInContainerPx: null,
        scrollContainerClientHeightPx: 0,
      };
    }
    const rowRect = element.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const top = rowRect.top - scrollRect.top;
    const bottom = rowRect.bottom - scrollRect.top;
    return {
      rowTopInContainerPx: top,
      rowBottomInContainerPx: bottom,
      scrollContainerClientHeightPx: scrollEl.clientHeight,
    };
  },
  getVirtualRowElement: (key) => virtualRowElementByKey.get(key),
  measureKeyForElement,
  commitVirtualRowMeasure: (el, source) => commitVirtualRowMeasure(el, source),
  now: nowMs,
});
resizeDeferMetrics = rowMeasure.resizeDeferMetrics;
unresolvedResizeDeltaByKey = rowMeasure.unresolvedResizeDeltaByKey;
measureRowLastHeightByKey = rowMeasure.measureRowLastHeightByKey;
rowResizeMeasureDeferredKeys = rowMeasure.rowResizeMeasureDeferredKeys;
scheduleVirtualRowMeasure = rowMeasure.scheduleVirtualRowMeasure;
flushDeferredRowResizeMeasures = rowMeasure.flushDeferredRowResizeMeasures;
clearMeasureStateForChannelSwitch =
  rowMeasure.clearMeasureStateForChannelSwitch;
clearDeferredResizeKeys = rowMeasure.clearDeferredResizeKeys;

/** Max scrollTop for the list container (actual DOM; aligns with virtualizer total height). */
function snapContainerScrollToBottom(intent: ScrollIntent) {
  if (!scrollOwnership.canSnapScrollBottom(intent)) return;
  const el = containerRef.value;
  if (!el) return;
  withProgrammaticScroll(() => {
    el.scrollTop = downwardOnlySnapScrollTop(
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
    );
  }, intent);
}

// Removed the viewport-shrink ResizeObserver re-pin (`layout-compensation` authority):
// post-initial-anchor it was already a no-op (scroll ownership blocked it), and during
// initial load the loading overlay now covers positioning. Stay-pinned-on-composer-growth
// is handled by the native bottom-pin in Stage 4 of the scroll refactor.

function beginPrependTransaction(
  channelId: string,
  snapshot: PrependSnapshot,
): number {
  prependTransactionActive.value = true;
  activePrependChannelId.value = channelId;
  activePrependTxId.value = snapshot.txId;
  return snapshot.txId;
}

function isPrependTransactionCurrent(channelId: string, txId: number): boolean {
  return (
    prependTransactionActive.value &&
    activePrependChannelId.value === channelId &&
    activePrependTxId.value === txId
  );
}

function finalizePrependTransaction(channelId: string, txId: number): void {
  if (!isPrependTransactionCurrent(channelId, txId)) {
    if (messageListDebugEnabled()) {
      logMessageList('prepend', 'prepend_tx_finalize_skipped', {
        channelId,
        txId,
        reason: 'stale_transaction',
        outcomeOk: false,
        expectation: 'finalize only runs for the active prepend tx',
      });
    }
    return;
  }
  prependTransactionActive.value = false;
  activePrependChannelId.value = null;
  activePrependTxId.value = 0;
  const scrollTopAfterRestore = containerRef.value?.scrollTop ?? 0;
  // Only suppress when still pinned near the top after restore — prevents an
  // immediate second fetch when scrollTop stayed at 0; successful restore moves
  // scrollTop down so the next upward scroll can paginate without leaving first.
  suppressLoadOlderUntilLeaveTopZone = scrollTopAfterRestore <= NEAR_TOP_PX;
  logMessageList('prepend', 'prepend_tx_finalized', {
    channelId,
    txId,
    scrollTopAfterRestore,
    suppressLoadOlderUntilLeaveTopZone,
    expectation:
      'suppress only when still near top after restore; otherwise next upward scroll can paginate',
    outcomeOk: true,
  });
  requestAnimationFrame(() => {
    updateJumpUiFromScroll();
  });
}

function logPrependCaptureFailure(channelId: string): void {
  if (!messageListDebugEnabled()) return;
  const el = containerRef.value;
  const virtualItems = virtualizer.value?.getVirtualItems() ?? [];
  const anchor = el
    ? getAnchorMessageIdFromViewport(
        el,
        virtualItems,
        displayOrderedIds.value,
        props.messages,
      )
    : null;
  const anchorTopMeasured =
    anchor && el
      ? measureMessageTopInContainer(el, anchor.anchorMessageId)
      : null;
  logMessageList('prepend', 'capture_snapshot_failed', {
    channelId,
    hasContainer: !!el,
    scrollTop: el?.scrollTop,
    scrollHeight: el?.scrollHeight,
    clientHeight: el?.clientHeight,
    virtualItemCount: virtualItems.length,
    messageCount: displayOrderedIds.value.length,
    resolvedAnchorId: anchor?.anchorMessageId ?? null,
    anchorTopMeasured,
  });
}

function capturePrependSnapshot(channelId: string): PrependSnapshot | null {
  const el = containerRef.value;
  const virtualItems = virtualizer.value?.getVirtualItems() ?? [];
  if (!el) return null;
  const anchor = getAnchorMessageIdFromViewport(
    el,
    virtualItems,
    displayOrderedIds.value,
    props.messages,
  );
  if (!anchor) return null;
  const anchorTopBefore = measureMessageTopInContainer(
    el,
    anchor.anchorMessageId,
  );
  if (anchorTopBefore == null) return null;
  return {
    channelId,
    txId: ++nextPrependTxId,
    anchorMessageId: anchor.anchorMessageId,
    anchorTopBefore,
    scrollTopBefore: el.scrollTop,
    scrollHeightBefore: el.scrollHeight,
  };
}

/**
 * One prepend = one commit (no visible half-states between merge and restored scroll):
 * capture anchor → fetch one batch (`loadOlder` merges once in the orchestrator) →
 * `nextTick` once (DOM/virtualizer flush) → `restorePrependScroll` once
 * (scrollHeight Δ + optional bounded anchor snap) → finalize.
 */
async function loadOlderWithTransaction(
  loader = props.loadOlder,
  initialBackfill = false,
) {
  const el = containerRef.value;
  const fn = loader;
  const channelId = props.channelId?.trim();
  const t0 =
    messageListDebugEnabled() && typeof performance !== 'undefined'
      ? performance.now()
      : 0;

  if (!el) {
    logMessageList('prepend', 'loadOlder_skipped', { reason: 'no_container' });
    return;
  }
  if (!fn) {
    logMessageList('prepend', 'loadOlder_skipped', {
      reason: 'no_loadOlder_fn',
    });
    return;
  }
  if (!channelId) {
    logMessageList('prepend', 'loadOlder_skipped', { reason: 'no_channelId' });
    return;
  }
  if (prependTransactionActive.value) {
    logMessageListThrottled(
      'prepend_skip_tx_active',
      400,
      'prepend',
      'loadOlder_skipped',
      {
        reason: 'prepend_transaction_active',
        activeTxId: activePrependTxId.value,
        activeChannelId: activePrependChannelId.value,
      },
    );
    return;
  }
  if (
    props.loadingOlder ||
    props.initialBackfillLoading ||
    (initialBackfill && !props.loadInitialBackfill)
  ) {
    logMessageListThrottled(
      'prepend_skip_props_loading',
      400,
      'prepend',
      'loadOlder_skipped',
      { reason: 'props_loading' },
    );
    return;
  }
  if (messageWindowAuthority.hasMoreOlder.value === false) {
    logMessageList('prepend', 'loadOlder_skipped', {
      reason: 'hasMoreOlder_false',
    });
    return;
  }

  const snapshot = capturePrependSnapshot(channelId);
  if (!snapshot) {
    logPrependCaptureFailure(channelId);
    return;
  }

  logMessageList('prepend', 'prepend_tx_start', {
    txId: snapshot.txId,
    channelId,
    anchorMessageId: snapshot.anchorMessageId,
    anchorTopBefore: snapshot.anchorTopBefore,
    scrollTopBefore: snapshot.scrollTopBefore,
    scrollHeightBefore: snapshot.scrollHeightBefore,
    messageCountBefore: displayOrderedIds.value.length,
    expectation:
      'fetch merges older batch once, then restore preserves anchor (id + px) within drift threshold',
  });

  const txId = beginPrependTransaction(channelId, snapshot);
  olderFetchSkeletonActive.value = true;
  const messageCountBeforeFetch = displayOrderedIds.value.length;
  let restoreRan = false;
  let lastAnchorRestoreOk = false;
  try {
    const added = await fn();
    if (!added || !isPrependTransactionCurrent(channelId, txId)) {
      olderFetchSkeletonActive.value = false;
      logMessageList('prepend', 'prepend_tx_after_fetch', {
        txId,
        added: !!added,
        stillCurrent: isPrependTransactionCurrent(channelId, txId),
        elapsedMs: t0 ? Math.round(performance.now() - t0) : undefined,
        outcomeOk: false,
        expectation:
          'fetch returned true and transaction still current before scroll restore',
      });
      logMessageList('prepend', 'prepend_tx_restore_skipped', {
        txId,
        reason: !added
          ? 'loadOlder_returned_false'
          : 'transaction_no_longer_current',
        anchorMessageId: snapshot.anchorMessageId,
        outcomeOk: false,
        expectation:
          'scroll restore runs only after a successful merge for this tx',
      });
      return;
    }
    olderFetchSkeletonActive.value = false;
    await nextTick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    if (performance.mark)
      performance.mark(`messagelist-prepend-nexttick-${txId}`);
    restoreRan = true;
    const restore = restorePrependScroll(el, snapshot);
    scrollObservation.scrollTop = el.scrollTop;
    const anchorAfter = measureMessageTopInContainer(
      el,
      snapshot.anchorMessageId,
    );
    const anchorDriftPx =
      anchorAfter != null
        ? Math.abs(anchorAfter - snapshot.anchorTopBefore)
        : null;
    const anchorRestoreOk =
      anchorAfter != null &&
      anchorDriftPx != null &&
      anchorDriftPx <= ANCHOR_DRIFT_THRESHOLD_PX;
    lastAnchorRestoreOk = anchorRestoreOk;
    logMessageList('prepend', 'prepend_restore', {
      txId,
      heightDeltaApplied: restore.heightDeltaApplied,
      anchorSnapDeltaApplied: restore.anchorSnapDeltaApplied,
      anchorSnapPassesUsed: restore.anchorSnapPassesUsed,
      anchorTopAfter: anchorAfter,
      expectedAnchorTop: snapshot.anchorTopBefore,
      anchorDriftPx,
      driftThresholdPx: ANCHOR_DRIFT_THRESHOLD_PX,
      anchorRestoreOk,
      outcomeOk: anchorRestoreOk,
      expectation:
        'anchor message stays at same visual offset (drift ≤ driftThresholdPx after bounded snaps)',
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  } finally {
    olderFetchSkeletonActive.value = false;
    finalizePrependTransaction(channelId, txId);
    if (t0) {
      logMessageList('prepend', 'prepend_tx_done', {
        txId,
        channelId,
        totalMs: Math.round(performance.now() - t0),
        restoreRan,
        anchorRestoreOk: restoreRan ? lastAnchorRestoreOk : null,
        messageCountAfter: displayOrderedIds.value.length,
        outcomeOk: restoreRan && lastAnchorRestoreOk,
        expectation:
          'fetch merged, restore ran, anchor drift within threshold; otherwise inspect prepend_restore or skip logs',
      });
    }
  }
}

function runLoadOlderIfEligible() {
  const el = containerRef.value;
  if (
    !el ||
    !props.loadOlder ||
    messageWindowAuthority.hasMoreOlder.value === false
  ) {
    if (messageListDebugEnabled() && el && el.scrollTop <= NEAR_TOP_PX + 40) {
      logMessageListThrottled(
        'scroll_early_exit',
        300,
        'scroll',
        'loadOlder_inactive',
        {
          hasLoadOlder: !!props.loadOlder,
          hasMoreOlder: messageWindowAuthority.hasMoreOlder.value,
          scrollTop: el.scrollTop,
        },
      );
    }
    return;
  }
  if (prependTransactionActive.value) {
    logMessageListThrottled(
      'scroll_skip_prepend',
      200,
      'scroll',
      'onScrollLoadOlder_skipped',
      {
        reason: 'prepend_transaction_active',
        txId: activePrependTxId.value,
        scrollTop: el.scrollTop,
      },
    );
    return;
  }
  if (suppressLoadOlderUntilLeaveTopZone) {
    const leavingTopZone = el.scrollTop > NEAR_TOP_PX;
    const userScrollingUpForMore = scrollObservation.direction === 'up';
    if (leavingTopZone || userScrollingUpForMore) {
      suppressLoadOlderUntilLeaveTopZone = false;
      logMessageList('scroll', 'suppress_top_zone_cleared', {
        scrollTop: el.scrollTop,
        reason: leavingTopZone ? 'left_top_zone' : 'upward_scroll',
      });
    } else {
      logMessageListThrottled(
        'scroll_suppress_top_zone',
        280,
        'scroll',
        'loadOlder_suppressed_until_leave_top',
        {
          scrollTop: el.scrollTop,
          nearTopPx: NEAR_TOP_PX,
          direction: scrollObservation.direction,
        },
      );
      return;
    }
  }
  if (el.scrollTop > NEAR_TOP_PX) return;
  if (props.loadingOlder || prependTransactionActive.value) {
    logMessageListThrottled(
      'scroll_skip_loading',
      300,
      'scroll',
      'loadOlder_skipped',
      {
        reason: 'already_loading',
        loadingOlder: props.loadingOlder,
        prependTransactionActive: prependTransactionActive.value,
        scrollTop: el.scrollTop,
      },
    );
    return;
  }
  const atNearTop = el.scrollTop <= NEAR_TOP_PX;
  const atScrollTopCeiling = isAtScrollTopCeiling(el.scrollTop);
  // At the physical ceiling wheel-up cannot move scrollTop further — allow
  // pagination without a scroll delta once the user has scrolled all the way up.
  const allowWithoutUpScroll = atNearTop && atScrollTopCeiling;
  if (!allowWithoutUpScroll && scrollObservation.direction !== 'up') {
    logMessageListThrottled(
      'scroll_not_up',
      220,
      'scroll',
      'loadOlder_skipped',
      {
        reason: 'not_scrolling_up',
        direction: scrollObservation.direction,
        scrollTop: el.scrollTop,
      },
    );
    return;
  }
  logMessageList('scroll', 'loadOlder_trigger', {
    scrollTop: el.scrollTop,
    direction: scrollObservation.direction,
    scrollHeight: el.scrollHeight,
  });
  void loadOlderWithTransaction();
}

const {
  virtualizer,
  virtualizerTotalSize,
  virtualizerItems,
  resolveMessageListOverscan,
  revisionKeyForMessageIndex,
  estimateMessageRowSizeForMessage,
  estimateMessageRowSize,
} = useMessageListVirtualizer({
  getContainer: () => containerRef.value,
  getChannelId: () => props.channelId,
  displayOrderedIds,
  virtualizerOrderedIds,
  messageListRowPresentations,
  mergedMessagesForList,
  scrollContainerPaddingTopPx,
  isPrependSkeletonVirtualIndex,
  virtualIndexToMessageIndex,
  estimatePrependSkeletonRowSizePx,
  olderFetchSkeletonActive,
  coarsePointer,
  safariLikeBrowser,
  prependTransactionActive,
  followNewMessagesToBottom,
  scrollObservation,
  scrollCompensation,
  scrollOwnership,
  captureScrollCompensationAnchor,
});

useMessageListDevDiagnostics({
  channelId: () => props.channelId,
  transitionLoading: () => !!props.transitionLoading,
  initialHistoryLoading: () => !!props.initialHistoryLoading,
  displayOrderedIds,
  showLoadingSkeleton,
  isEmpty,
  showNoServersYet,
  discordMessageImportEligible,
  showDiscordImportWidget,
  canShowDiscordChannelImport: () => !!props.canShowDiscordChannelImport,
  isDiscordImportedServer: () => !!props.isDiscordImportedServer,
  discordChannelId: () => props.discordChannelId,
  channelType: () => props.channelType,
  resolveOverscan: resolveMessageListOverscan,
  hasChannelIndex: () => !!activeChannelIndex.value,
});

captureScrollCompensationAnchorImpl = () => {
  const el = containerRef.value;
  if (!el || scrollCompensation.getPendingAnchor()) return;
  const virtualItems = virtualizer.value?.getVirtualItems() ?? [];
  const anchor = getAnchorMessageIdFromViewport(
    el,
    virtualItems,
    displayOrderedIds.value,
    props.messages,
  );
  if (!anchor) return;
  const top = measureMessageTopInContainer(el, anchor.anchorMessageId);
  if (top == null) return;
  const payload: ScrollCompensationAnchor = {
    messageId: anchor.anchorMessageId,
    anchorTopInContainerPx: top,
    scrollTopPx: el.scrollTop,
  };
  scrollCompensation.captureAnchor(payload);
};

applyAnchorReconcileAtSettleImpl = () => {
  const anchor = scrollCompensation.getPendingAnchor();
  if (!anchor || !MESSAGE_LIST_COMPENSATION_ANCHOR_RECONCILE) {
    scrollCompensation.clearAnchor();
    return;
  }
  const el = containerRef.value;
  if (!el) {
    scrollCompensation.clearAnchor();
    return;
  }
  const newTop = measureMessageTopInContainer(el, anchor.messageId);
  if (newTop == null) {
    scrollCompensation.clearAnchor();
    return;
  }
  const correction = scrollCompensation.computeAnchorReconcileCorrectionPx(
    anchor,
    newTop,
  );
  scrollCompensation.clearAnchor();
  if (Math.abs(correction) < 0.5) return;
  scrollCompensation.recordCorrection(correction, 'after_settle');
  messageListScrollMetricsApi()?.noteLayoutSample({
    largestPostSettleCorrectionPx: Math.abs(correction),
    anchorDisplacementPxMax: Math.abs(correction),
  });
  withProgrammaticScroll(() => {
    el.scrollTop += correction;
  });
};

const {
  remeasureVisibleVirtualRows,
  scheduleContentPatchRemeasure: scheduleContentPatchRemeasureFromGeometry,
  commitVirtualRowMeasure: commitVirtualRowMeasureFromGeometry,
  measureRowRefForIndex,
  flashMessageHighlight,
} = useMessageListRowGeometry({
  getContainer: () => containerRef.value,
  getChannelId: () => props.channelId,
  getVirtualItems: () => virtualizer.value?.getVirtualItems() ?? [],
  virtualizerItems,
  measureElement: (element) => virtualizer.value.measureElement(element),
  isPrependSkeletonVirtualIndex,
  virtualIndexToMessageIndex,
  messageIdForVirtualIndex,
  displayOrderedIds,
  messageListRowPresentations,
  mergedMessagesForList,
  virtualRowElementByKey,
  scheduleVirtualRowMeasure,
  syncVirtualRowResizeObservation,
  detachVirtualRowResizeObservation,
  invalidateMeasureKey: (measureKey) =>
    rowMeasure.invalidateMeasureKey(measureKey),
  measureRowLastHeightByKey,
  revisionKeyForMessageIndex,
  estimateMessageRowSizeForMessage,
  estimateMessageRowSize,
});
scheduleContentPatchRemeasureImpl = scheduleContentPatchRemeasureFromGeometry;
commitVirtualRowMeasure = commitVirtualRowMeasureFromGeometry;

function finishScrollHydrationSettle(): void {
  deferFullRowHydration.value = false;
  syncScrollGestureSurface(false);
  flushDeferredRowResizeMeasures();
  remeasureVisibleVirtualRows({ force: true });
  applyAnchorReconcileAtSettle();
  flushPendingRowFactsAfterScrollSettle();
  messageListScrollMetricsApi()?.mergeCompensationMetrics(
    scrollCompensation.getMetrics(),
  );
}

function markScrollHydrationDeferral(): void {
  syncScrollGestureSurface(true);
  if (!safariLikeBrowser) {
    deferFullRowHydration.value = true;
  }
  if (hydrationSettleTimer != null) clearTimeout(hydrationSettleTimer);
  hydrationSettleTimer = setTimeout(() => {
    hydrationSettleTimer = null;
    finishScrollHydrationSettle();
  }, USER_SCROLL_SETTLE_MS);
}

/**
 * GIF/media decode changes row height after mount. TanStack’s default scroll
 * compensation while `scrollDirection` is null (not user-scrolling) can fight
 * “pinned to newest” and visibly yank the list up/down repeatedly.
 */
function commitScrollToLatest(
  options: {
    smooth?: boolean;
    forceScrollToIndex?: boolean;
    intent?: ScrollIntent;
  } = {},
): void {
  const intent = options.intent ?? 'follow-tail';
  if (!scrollOwnership.canCommit(intent)) return;
  noteSubtractionScrollWrite(intent);
  const el = containerRef.value;
  const v = virtualizer.value;
  if (!v || displayOrderedIds.value.length === 0) return;
  const smooth = options.smooth ?? false;
  const lastIdx = displayOrderedIds.value.length - 1;
  const maySnap = scrollOwnership.canSnapScrollBottom(intent);

  if (el) {
    const virtualDist = v.getTotalSize() - el.scrollTop - el.clientHeight;
    if (
      shouldSkipScrollToIndexForLatest({
        smooth,
        forceScrollToIndex: options.forceScrollToIndex,
        virtualDistFromBottomPx: virtualDist,
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        nearBottomAttachPx: FOLLOW_NEW_ATTACH_PX,
      })
    ) {
      if (maySnap) snapContainerScrollToBottom(intent);
      return;
    }
  }

  withProgrammaticScroll(() =>
    v.scrollToIndex(lastIdx, {
      align: 'end',
      behavior: smooth ? 'smooth' : 'auto',
    }),
  );
  if (!maySnap) return;
  if (!smooth) {
    snapContainerScrollToBottom(intent);
    if (!scrollOwnership.isInitialAnchorSettled()) {
      requestAnimationFrame(() => snapContainerScrollToBottom(intent));
    }
  } else {
    window.setTimeout(() => snapContainerScrollToBottom(intent), 400);
  }
}
commitScrollToLatestForViewportMemory = commitScrollToLatest;

/**
 * @param intent declares whether this is a direct user action (`'user-intent'`,
 *   always honored) or a passive follow/compensation write that must yield to the
 *   user. Exposed callers (composer growth) default to the passive path.
 */
function scrollToBottom(smooth = false, intent: ScrollIntent = 'follow-tail') {
  if (suppressListUntilInitialAnchor.value) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      if (suppressListUntilInitialAnchor.value) return;
      if (!scrollOwnership.canCommit(intent)) return;
      commitScrollToLatest({ smooth, intent });
    });
  });
}

runLoadOlderIfEligibleForScroll = runLoadOlderIfEligible;
markScrollHydrationDeferralForScroll = markScrollHydrationDeferral;
scrollToBottomForJump = scrollToBottom;

/**
 * First paint after channel switch / history load — not for pagination or new messages.
 * One commit after Vue flush: `nextTick` → single `requestAnimationFrame` → anchor + optional snap → done.
 */
function applyInitialScrollAnchor() {
  initialAnchorScheduleGeneration++;
  const scheduleId = initialAnchorScheduleGeneration;
  const channelId = props.channelId?.trim() ?? null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  logMessageList('initial_anchor', 'initial_anchor_scheduled', {
    scheduleId,
    channelId,
    messageCount: displayOrderedIds.value.length,
    expectation: 'one rAF commit: scroll to bottom of loaded window',
  });
  nextTick(() => {
    requestAnimationFrame(() => {
      if (scheduleId !== initialAnchorScheduleGeneration) {
        logMessageList('initial_anchor', 'initial_anchor_aborted_stale', {
          scheduleId,
          currentGeneration: initialAnchorScheduleGeneration,
          channelId,
          outcomeOk: false,
          expectation: 'newer schedule replaced this one — no commit',
        });
        return;
      }
      const v = virtualizer.value;
      const finish = (
        anchor:
          | 'top'
          | 'bottom'
          | 'restored_memory'
          | 'skipped_empty'
          | 'user_owned',
      ) => {
        disarmInitialAnchorOverlaySafety();
        markListPresentationReady('initial_anchor_settled');
        scrollOwnership.markInitialAnchorSettled();
        suppressListUntilInitialAnchor.value = false;
        emitSeenMessageId(resolveSeenMessageId());
        const el = containerRef.value;
        const distBottom = el ? distanceFromBottomPx() : null;
        let outcomeOk = true;
        let expectation =
          anchor === 'bottom'
            ? `near bottom (distFromBottomPx < ${NEAR_BOTTOM_PX + 50})`
            : anchor === 'top'
              ? `near top (scrollTop small)`
              : 'empty — no scroll';
        if (anchor === 'bottom') {
          outcomeOk = distBottom != null && distBottom < NEAR_BOTTOM_PX + 50;
        } else if (anchor === 'top') {
          outcomeOk = (el?.scrollTop ?? 0) <= NEAR_TOP_PX + 40;
        } else if (anchor === 'restored_memory') {
          expectation = 'restored near previous anchor position';
        } else if (anchor === 'user_owned') {
          expectation =
            'user took control during initial load — anchor intentionally skipped';
        }
        logMessageList('initial_anchor', 'initial_anchor_commit', {
          scheduleId,
          channelId,
          anchor,
          messageCount: displayOrderedIds.value.length,
          scrollTop: el?.scrollTop,
          scrollHeight: el?.scrollHeight,
          clientHeight: el?.clientHeight,
          distFromBottomPx: distBottom,
          settledMs:
            typeof performance !== 'undefined'
              ? Math.round(performance.now() - t0)
              : undefined,
          outcomeOk,
          expectation: `initial anchor: ${expectation}`,
        });
        if (import.meta.env.DEV && typeof performance !== 'undefined') {
          emitDiagnostic({
            level: 'info',
            domain: 'ui',
            event: 'message_list_step2_initial_anchor_settled',
            stage: 'success',
            context: {
              channelId: props.channelId ?? null,
              messageCount: displayOrderedIds.value.length,
              anchor,
              settledMs: Math.round(performance.now() - t0),
            },
          });
        }
        triggerInitialBackfillAfterAnchor({
          anchor,
          outcomeOk,
          pending: !!props.initialBackfillPending,
          loading: !!props.initialBackfillLoading,
          channelId,
          messageCount: displayOrderedIds.value.length,
          settledMs:
            typeof performance !== 'undefined'
              ? Math.round(performance.now() - t0)
              : undefined,
          run: () =>
            void loadOlderWithTransaction(props.loadInitialBackfill, true),
        });
      };
      if (!v || displayOrderedIds.value.length === 0) {
        finish('skipped_empty');
        return;
      }
      // The single-authority rule: the one-shot anchor must yield if the user
      // already grabbed the scroll during history load. This is the fix for
      // "channels correct my explicit scroll events on initial load."
      if (!scrollOwnership.canCommit('initial-anchor')) {
        finish('user_owned');
        return;
      }
      const settleThenFinish = (
        anchor: 'top' | 'bottom' | 'restored_memory',
      ) => {
        requestAnimationFrame(() => {
          if (scheduleId !== initialAnchorScheduleGeneration) return;
          if (anchor === 'bottom' || followNewMessagesToBottom.value) {
            snapContainerScrollToBottom('initial-anchor');
          }
          persistViewportMemoryForChannel(channelId);
          finish(anchor);
        });
      };
      /** Passive anchor writes after async work must re-check — user may have scrolled during restore. */
      const commitInitialAnchorFallback = (): boolean => {
        if (!scrollOwnership.canCommit('initial-anchor')) {
          finish('user_owned');
          return false;
        }
        const saved = channelId ? readMessageListViewport(channelId) : null;
        if (saved && !saved.followNewMessages) {
          // Mid-history restore failed — keep the initialOffset estimate; never jump to tail.
          requestAnimationFrame(() => {
            if (scheduleId !== initialAnchorScheduleGeneration) return;
            persistViewportMemoryForChannel(channelId);
            finish('restored_memory');
          });
          return false;
        }
        commitScrollToLatest({ intent: 'initial-anchor' });
        settleThenFinish('bottom');
        return true;
      };
      if (channelId) {
        void restoreViewportMemoryForChannel(channelId).then((restored) => {
          if (scheduleId !== initialAnchorScheduleGeneration) return;
          if (restored) {
            if (!scrollOwnership.canCommit('viewport-restore')) {
              finish('user_owned');
              return;
            }
            settleThenFinish('restored_memory');
            return;
          }
          commitInitialAnchorFallback();
        });
        return;
      }
      commitScrollToLatest({ intent: 'initial-anchor' });
      settleThenFinish('bottom');
    });
  });
}

const pendingInitialScroll = ref(false);
const {
  getVoteHandler,
  getReactHandler,
  getPinHandler,
  getUnpinHandler,
  clearBubbleActionHandlers,
} = createMessageListBubbleActionHandlers({
  onPollVote: () => props.onPollVote,
  onReact: () => props.onReact,
  onPin: () => props.onPin,
  onUnpin: () => props.onUnpin,
});

watch(
  () => props.channelId,
  (cid) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (performance.mark) performance.mark(`messagelist-channel-change-${cid}`);
    if (messageListDebugEnabled()) {
      console.log(
        `%c[MessageList] channelId changed to ${cid}`,
        'color: #ff9800',
        { time: t0 },
      );
    }
    initialAnchorScheduleGeneration++;
    logMessageList('lifecycle', 'channel_changed', {
      channelId: cid ?? null,
      initialAnchorScheduleGeneration,
      expectation:
        'state reset for new channel; pending initial scroll will schedule anchor when history ready',
    });
    clearMeasureStateForChannelSwitch();
    noteSubtractionBeginChannelSwitch();
    disconnectRowResizeObserver();
    scrollObservation.scrollTop = 0;
    scrollObservation.direction = 'still';
    scrollOwnership.reset();
    beginChannelTransition(cid);
    suppressLoadOlderUntilLeaveTopZone = false;
    prependTransactionActive.value = false;
    olderFetchSkeletonActive.value = false;
    activePrependChannelId.value = null;
    activePrependTxId.value = 0;
    if (cid) {
      pendingInitialScroll.value = true;
      suppressListUntilInitialAnchor.value = true;
    } else {
      pendingInitialScroll.value = false;
      suppressListUntilInitialAnchor.value = false;
    }
    jumpUi.reset();
    followNewMessagesToBottom.value = true;
    clearBubbleActionHandlers();
    clearUnreadBoundaryMemory();
    lastEmittedSeenMessageId = undefined;
    emitSeenMessageId(null);
  },
  { immediate: true },
);

watch(
  () =>
    [
      props.channelId,
      props.initialHistoryLoading,
      displayOrderedIds.value.length,
    ] as const,
  () => {
    if (props.initialHistoryLoading) return;
    if (displayOrderedIds.value.length === 0) return;
    if (!pendingInitialScroll.value) return;
    if (isClientOnlyDmOpenShellChannelId(props.channelId)) return;
    pendingInitialScroll.value = false;
    applyInitialScrollAnchor();
  },
  { immediate: true },
);

function isNearBottom(threshold = NEAR_BOTTOM_PX) {
  const el = containerRef.value;
  const v = virtualizer.value;
  if (!el || !v) return true;
  const total = v.getTotalSize();
  return total - el.scrollTop - el.clientHeight < threshold;
}

let offBeforeChannelChange: (() => void) | null = null;

onMounted(() => {
  installMessageListScrollMetrics();
  if (messageListDebugEnabled() || isMessageListScrollMetricsEnabled()) {
    console.log(
      `%c[MessageList] Component mounted for channel: ${props.channelId}`,
      'color: #8bc34a',
      { time: typeof performance !== 'undefined' ? performance.now() : 0 },
    );
  }
  offBeforeChannelChange = messageWindowAuthority.onBeforeActiveChannelChange(
    () => {
      const leaving = messageWindowAuthority.getActiveChannelId();
      if (leaving) persistViewportMemoryForChannel(leaving);
      flushMessageListViewportStorage();
    },
  );
  nextTick(() => {
    const el = containerRef.value;
    if (el) {
      scrollObservation.scrollTop = el.scrollTop;
      el.addEventListener('scroll', onScrollCombined, { passive: true });
      el.addEventListener('wheel', onWheelNearTopForLoadOlder, {
        passive: true,
      });
      el.addEventListener('wheel', onUserScrollGesture, { passive: true });
      el.addEventListener('touchstart', onUserScrollGesture, { passive: true });
      el.addEventListener('keydown', onKeydownScrollGesture);
      emitSeenMessageId(resolveSeenMessageId());
      logMessageList('scroll', 'scroll_listener_attached', {
        passive: true,
        outcomeOk: true,
        expectation: 'passive scroll — no preventDefault; idle work in rAF',
      });
    }
  });
});

onUnmounted(() => {
  offBeforeChannelChange?.();
  offBeforeChannelChange = null;
  emitSeenMessageId(null);
  persistViewportMemoryForChannel();
  flushMessageListViewportStorage();
  disposeScrollSideEffects();
  disposeViewportMemory();
  if (hydrationSettleTimer != null) {
    clearTimeout(hydrationSettleTimer);
    hydrationSettleTimer = null;
  }
  disarmInitialAnchorOverlaySafety();
  disconnectRowResizeObserver();
  const el = containerRef.value;
  if (el) {
    el.removeEventListener('scroll', onScrollCombined);
    el.removeEventListener('wheel', onWheelNearTopForLoadOlder);
    el.removeEventListener('wheel', onUserScrollGesture);
    el.removeEventListener('touchstart', onUserScrollGesture);
    el.removeEventListener('keydown', onKeydownScrollGesture);
  }
});

/** Length-only: avoids deep reactivity on every message field; scroll after layout commit (nextTick + rAF) to avoid forced reflow. */
watch(
  () => displayOrderedIds.value.length,
  (len, prevLen) => {
    if (messageListDebugEnabled()) {
      console.log(
        `%c[MessageList] displayOrderedIds.length changed to ${len} (was ${prevLen})`,
        'color: #ff5722',
        { time: typeof performance !== 'undefined' ? performance.now() : 0 },
      );
    }
    if (prependTransactionActive.value) return;
    if (suppressListUntilInitialAnchor.value) return;
    if (len <= (prevLen ?? 0)) return;
    if ((prevLen ?? 0) === 0) {
      nextTick(() => {
        requestAnimationFrame(() => {
          emitSeenMessageId(resolveSeenMessageId());
        });
      });
      return;
    }
    /** Skip first history batch — initial scroll uses `applyInitialScrollAnchor`. */
    if (prevLen === undefined) return;
    const lastMessageId = displayOrderedIds.value[len - 1];
    const lastMessage =
      (lastMessageId ? props.messages.get(lastMessageId) : undefined) ??
      (lastMessageId
        ? mergedMessagesForList.value.get(lastMessageId)
        : undefined);
    const sentByCurrentUser =
      !!lastMessage &&
      isEchoMessageLogicallyOwn(
        lastMessage,
        props.currentUserId,
        props.linkedDiscordUserId,
      );

    const followIntent: ScrollIntent = sentByCurrentUser
      ? 'user-intent'
      : 'follow-tail';
    nextTick(() => {
      requestAnimationFrame(() => {
        const v = virtualizer.value;
        if (!v) return;
        const near = distanceFromBottomPx() < FOLLOW_NEW_DETACH_PX;
        const shouldFollow =
          sentByCurrentUser || followNewMessagesToBottom.value || near;
        if (!shouldFollow) return;
        if (
          !sentByCurrentUser &&
          isUserScrollProtected(v.scrollDirection ?? null)
        ) {
          return;
        }
        if (!scrollOwnership.canCommit(followIntent)) return;
        commitScrollToLatest({
          forceScrollToIndex: sentByCurrentUser,
          intent: followIntent,
        });
        followNewMessagesToBottom.value = true;
        emitSeenMessageId(resolveSeenMessageId());
      });
    });
  },
);

const SCROLL_TO_MESSAGE_DISPLAY_RETRY = 8;

/** USER-INTENT SCROLL: reply-preview click / message-link jump. See {@link jumpToLatestMessages}. */
async function scrollMessageIntoView(messageId: string): Promise<boolean> {
  revealDmCallRunContainingMessageIfCollapsed(messageId);
  let idx = -1;
  for (let attempt = 0; attempt < SCROLL_TO_MESSAGE_DISPLAY_RETRY; attempt++) {
    await nextTick();
    idx = displayOrderedIds.value.findIndex((id) => id === messageId);
    if (idx >= 0) break;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  if (idx < 0) return false;
  deferFullRowHydration.value = false;
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      withProgrammaticScroll(() =>
        virtualizer.value.scrollToIndex(idx, {
          align: 'center',
          behavior: 'smooth',
        }),
      );
      resolve();
    });
  });
  return true;
}

defineExpose({
  scrollMessageIntoView,
  flashMessageHighlight,
  scrollToBottom,
  isNearBottom,
});
</script>

<template>
  <div
    class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col"
    data-cy="message-list-root"
  >
    <span
      v-if="!showInitialLoadOverlay"
      data-cy="chat-skeleton-gone"
      hidden
      aria-hidden="true"
    />
    <div
      ref="containerRef"
      data-cy="message-list"
      role="log"
      aria-live="off"
      :aria-label="channelName ? `Messages in ${channelName}` : 'Messages'"
      class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 touch-pan-y"
      v-scrollbar-on-scroll
      :class="scrollContainerPaddingBottomClass"
      :style="{ paddingTop: `${scrollContainerPaddingTopPx}px` }"
    >
      <MessageListEmptyStates
        v-if="showsBlockingEmptyChrome"
        :show-no-servers-yet="showNoServersYet"
        :show-empty-channel-hint="showEmptyChannelHint"
        :show-discord-import-widget="showDiscordImportWidget"
        :on-open-explore="onOpenExplore"
        :server-id="serverId"
        :channel-id="channelId"
        :channel-name="channelName"
        @imported="emit('imported')"
      />
      <div v-else class="relative w-full min-h-0">
        <DmHistoryIntroCard
          v-if="showDmHistoryIntro && props.dmHistoryIntro"
          class="mb-3"
          :title="props.dmHistoryIntro.title"
          :subtitle="props.dmHistoryIntro.subtitle"
          :avatar-url="props.dmHistoryIntro.avatarUrl"
          :presence-status="props.dmHistoryIntro.presenceStatus"
          :presence-mobile-surface="props.dmHistoryIntro.presenceMobileSurface"
          :hide-presence="props.dmHistoryIntro.hidePresence"
          :mutual-communities-count="
            props.dmHistoryIntro.mutualCommunitiesCount
          "
          :primary-action-label="props.dmHistoryIntro.primaryActionLabel"
          :on-primary-action="props.dmHistoryIntro.onPrimaryAction"
        />
        <div
          class="relative w-full min-h-0"
          :style="{ height: `${virtualizerTotalSize}px` }"
        >
          <div
            v-for="virtualRow in virtualizerItems"
            :key="virtualizerOrderedIds[virtualRow.index] ?? ''"
            class="message-list-virtual-row absolute left-0 top-0 w-full max-w-full"
            :class="{ 'message-list-virtual-row--webkit': safariLikeBrowser }"
            :style="{
              height: `${virtualRow.size}px`,
              transform: `translate3d(0, ${virtualRow.start}px, 0)`,
            }"
            data-cy="message-list-virtual-row"
          >
            <!--
              Measure the natural-height inner node; the outer shell uses the
              virtual slot height + overflow:hidden so underestimate windows
              clip instead of painting into the next absolute row (message collision).
            -->
            <div
              :data-index="virtualRow.index"
              :data-message-id="
                messageIdForVirtualIndex(virtualRow.index) ?? undefined
              "
              :ref="(el) => measureRowRefForIndex(el, virtualRow.index)"
              class="message-list-virtual-row__measure flow-root w-full max-w-full"
              data-cy="message-list-virtual-row-measure"
            >
              <div
                v-if="isPrependSkeletonVirtualIndex(virtualRow.index)"
                :role="virtualRow.index === 0 ? 'status' : undefined"
                :aria-live="virtualRow.index === 0 ? 'polite' : undefined"
                :aria-label="
                  virtualRow.index === 0 ? 'Loading older messages' : undefined
                "
                :aria-hidden="virtualRow.index === 0 ? undefined : true"
              >
                <MessageListOlderFetchLoadingHeader
                  v-if="virtualRow.index === 0"
                />
                <MessageListHistorySkeletonRow
                  :row="olderHistorySkeletonRows[virtualRow.index]!"
                  :is-first="virtualRow.index === 0"
                />
              </div>
              <div v-else class="relative w-full max-w-full">
                <MessageBubble
                  :row="
                    messageListRowPresentations[
                      virtualIndexToMessageIndex(virtualRow.index)
                    ]!
                  "
                  :channel-id="channelId"
                  :is-forum-post-channel="isForumPostChannel"
                  :server-id="serverId"
                  :resolve-author-role="resolveAuthorRole"
                  :current-user-id="currentUserId"
                  :linked-discord-user-id="linkedDiscordUserId"
                  :current-user-name="currentUserName"
                  :resolve-poll-voter-display="resolvePollVoterDisplay"
                  :resolve-poll-voter-avatar="resolvePollVoterAvatar"
                  :on-vote="
                    getVoteHandler(
                      displayOrderedIds[
                        virtualIndexToMessageIndex(virtualRow.index)
                      ],
                    )
                  "
                  :on-react="
                    getReactHandler(
                      displayOrderedIds[
                        virtualIndexToMessageIndex(virtualRow.index)
                      ],
                    )
                  "
                  :fill-image-slot="forwardFillImageSlot"
                  :on-go-to-channel="onGoToChannel"
                  :on-go-to-message="onGoToMessage"
                  :on-open-profile="onOpenProfile"
                  :on-open-profile-from-context-menu="
                    onOpenProfileFromContextMenu
                  "
                  @delete="forwardBubbleDelete"
                  @reply="forwardBubbleReply"
                  @edit="forwardBubbleEdit"
                  @expand-dm-call-roll="handleExpandDmCallRollFromBubble"
                  :is-pinned="
                    displayOrderedIds[
                      virtualIndexToMessageIndex(virtualRow.index)
                    ]
                      ? pinnedIdSet.has(
                          displayOrderedIds[
                            virtualIndexToMessageIndex(virtualRow.index)
                          ],
                        )
                      : false
                  "
                  :on-pin="
                    getPinHandler(
                      displayOrderedIds[
                        virtualIndexToMessageIndex(virtualRow.index)
                      ],
                    )
                  "
                  :on-unpin="
                    getUnpinHandler(
                      displayOrderedIds[
                        virtualIndexToMessageIndex(virtualRow.index)
                      ],
                    )
                  "
                  :can-moderate-author="canModerateAuthor"
                  @moderate-user="onModerateUser?.($event)"
                  :on-request-forward="onRequestForward"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!--
      Loading skeleton is an overlay (not in scroll flow) pinned to the BOTTOM of the
      viewport, so its last bar lands where the newest real message will. The list mounts
      underneath while loading; `initialOffset` paints the first page already bottom-anchored,
      and the skeleton cross-fades out to reveal real messages in place (no top→bottom jump,
      no blank frame). See Stage 2 of the message-list scroll plan.
    -->
    <Transition name="msg-skeleton-fade">
      <div
        v-if="showInitialLoadOverlay"
        class="message-list-skeleton-overlay pointer-events-none absolute inset-0 z-[1] flex flex-col justify-end overflow-hidden px-4"
        :style="{
          paddingTop: `${scrollContainerPaddingTopPx}px`,
          paddingBottom: '16px',
        }"
      >
        <MessageListHistorySkeleton aria-label="Loading messages" />
      </div>
    </Transition>
    <MessageListJumpFab
      :message-count="displayOrderedIds.length"
      :list-ui-blocked="
        showInitialLoadOverlay ||
        showNoServersYet ||
        showEmptyChannelHint ||
        showDiscordImportWidget
      "
      @jump="jumpToLatestMessages"
    />
  </div>
</template>

<style scoped lang="scss">
/*
 * Isolate row layout on Chromium; WebKit can defer repaints on contained,
 * transformed rows during fast scroll and the viewport reads blank briefly.
 *
 * Slot height is applied in the template (`height: virtualRow.size`). Without
 * that, overflow:hidden cannot clip to the virtual slot and underestimate
 * windows paint into the next absolute neighbor (message collision).
 */
.message-list-virtual-row {
  contain: layout;
  isolation: isolate;
  overflow: hidden;
}

.message-list-virtual-row--webkit {
  contain: none;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  overflow: hidden;
}

/* Keep the measuring list mounted beneath transparent loading bars. */
.message-list-skeleton-overlay {
  background: transparent;
}

/*
 * Skeleton → messages crossfade. The list is already painted (bottom-anchored via
 * `initialOffset`) underneath, so fading the overlay out dissolves the placeholder
 * bars into real messages rather than hard-swapping with a blank frame.
 */
.msg-skeleton-fade-leave-active {
  transition: opacity 220ms ease;
}
.msg-skeleton-fade-leave-to {
  opacity: 0;
}
.msg-skeleton-fade-enter-from {
  opacity: 0;
}
.msg-skeleton-fade-enter-active {
  transition: opacity 140ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .msg-skeleton-fade-leave-active,
  .msg-skeleton-fade-enter-active {
    transition: none;
  }
}
</style>
