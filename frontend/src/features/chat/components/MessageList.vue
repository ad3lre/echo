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
  shallowRef,
  type ComponentPublicInstance,
  type InjectionKey,
} from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
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
} from '@/features/chat/viewModel/messageListJumpUi';
import type { MemberRole, PopoutAnchorRect } from '@/utils/memberProfiles';
import { isClientOnlyDmOpenShellChannelId } from '@/features/dm/dmOpenShellChannelId';
import { isEchoGraphId } from '@/utils/echoIds';
import DiscordChannelImportWidget from '@/features/chat/components/DiscordChannelImportWidget.vue';
import { icons } from '@/assets/icons';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import {
  emitChatSwitchEvent,
  getActiveChatSwitchSnapshot,
} from '@/features/layout/chatSwitchPerfTrace';
import {
  collectMessageListRowFactsPatchIndices,
  describeOrderedIdsStructuralChange,
  fingerprintMessageListRowFactsInputs,
  shouldShowDaySeparatorBefore,
} from '@/features/chat/presentation/messageListRowFacts';
import {
  buildMessageListRowPresentationAtIndex,
  buildMessageListRowPresentations,
  type MessageListRowPresentation,
} from '@/features/chat/presentation/messageListRowPresentation';
import {
  MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX,
  estimateMessageListRowSizePx,
} from '@/features/chat/domain/messageListRowEstimate';
import { buildMessageRowRevisionKey } from '@/features/chat/domain/messageRowRevisionKey';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
  invalidateMessageRowHeight,
  setMessageRowHeightPx,
} from '@/features/chat/domain/messageRowHeightStore';
import { useMessageRowHydration } from '@/features/chat/composables/useMessageRowHydration';
import {
  ANCHOR_DRIFT_THRESHOLD_PX,
  getAnchorMessageIdFromViewport,
  getScrollDirection,
  isAtScrollTopCeiling,
  measureMessageTopInContainer,
  restorePrependScroll,
  type PrependSnapshot,
} from '@/features/chat/domain/messageListPrependAnchor';
import {
  restoreViewportAnchorInContainer,
  VIEWPORT_RESTORE_DOM_RETRY,
} from '@/features/chat/domain/messageListViewportRestore';
import { resolveMessageListInitialOffsetPx } from '@/features/chat/domain/messageListInitialOffset';
import {
  clearMessageListViewport,
  flushMessageListViewportStorage,
  readMessageListViewport,
  writeMessageListViewport,
} from '@/features/chat/composables/messageListViewportStorage';
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
} from '@/utils/messageListDebugLog';
import { dbgReadState } from '@/utils/echoReadStateDebug';
import { isEchoMessageLogicallyOwn } from '@/features/chat/domain/discordTwinMessageOwnership';
import {
  DM_CALL_LOG_HISTORY_VISIBLE_CAP,
  buildDmCallLogPresentation,
  dmCallRollupRevealKey,
  isDmCallLocalLogEntity,
  isDmCallRollupCollapseMessageId,
  parseDmCallRollupMessageId,
} from '@/features/chat/domain/dmCallLogHistoryCollapse';
import { useCoarsePointer } from '@/composables/useCoarsePointer';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import DmHistoryIntroCard from './DmHistoryIntroCard.vue';
import { getMessageListScrollExperimentFlags } from '@/features/chat/domain/messageListScrollExperiments';
import {
  createScrollCompensationController,
  resolveShouldAdjustScrollPosition,
  type ScrollCompensationAnchor,
} from '@/features/chat/domain/messageListScrollCompensation';
import {
  computeUnresolvedResizeDeltaPx,
  createResizeDeferMetrics,
  resolveResizeMeasureAction,
} from '@/features/chat/domain/messageListResizeDefer';
import {
  installMessageListScrollMetrics,
  isMessageListScrollMetricsEnabled,
  messageListScrollMetricsApi,
} from '@/features/chat/composables/messageListScrollMetrics';
import { createMessageListRowInvalidationController } from '@/features/chat/domain/messageListRowInvalidation';
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
  loadInitialBackfill?: () => Promise<boolean>;
  initialBackfillLoading?: boolean;
  initialBackfillPending?: boolean;
  /**
   * Ensure a message id is present in the loaded window (e.g. prefetch for saved scroll restore).
   */
  ensureMessageInWindow?: (messageId: string) => Promise<boolean>;
  loadingOlder?: boolean;
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
const canonicalOrderedIds = computed(
  () => messageWindowAuthority.orderedIds.value,
);

/** When a run of DM call logs is collapsed, expanding reveals all rows for that run (per channel). */
const dmCallRollupRevealKeys = ref(new Set<string>());

watch(
  () => props.channelId?.trim() ?? '',
  () => {
    dmCallRollupRevealKeys.value = new Set();
  },
);

const dmCallPresentation = computed(() =>
  buildDmCallLogPresentation(
    canonicalOrderedIds.value,
    messageWindowAuthority.entitiesById.value,
    props.messages,
    props.channelId?.trim(),
    dmCallRollupRevealKeys.value,
  ),
);

/** Ids actually rendered (may inject a synthetic rollup row for long DM call-log runs). */
const displayOrderedIds = computed(
  () => dmCallPresentation.value.displayOrderedIds,
);
const mergedEntitiesForList = computed(
  () => dmCallPresentation.value.mergedEntities,
);
const mergedMessagesForList = computed(
  () => dmCallPresentation.value.mergedMessages,
);

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

const scrollExperiments = getMessageListScrollExperimentFlags();
const scrollCompensation = createScrollCompensationController({ now: nowMs });
const resizeDeferMetrics = createResizeDeferMetrics();
const unresolvedResizeDeltaByKey = new Map<string, number>();
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

let flushPendingRowFactsAfterScrollSettleImpl: (() => void) | null = null;
function flushPendingRowFactsAfterScrollSettle(): void {
  flushPendingRowFactsAfterScrollSettleImpl?.();
}

/**
 * Fully prepared row models — patched incrementally when possible; full rebuild only on structural change.
 * Fingerprints avoid recomputing rows whose inputs are unchanged (prefer CPU stability over shaving a Map).
 */
const messageListRowPresentations = ref<MessageListRowPresentation[]>([]);
let rowFactsPrevOrderedIds: string[] | null = null;
let rowFactsPrevCompactTop: boolean | undefined = undefined;
let rowFactsPrevFirstUnreadMessageId: string | null | undefined = undefined;
let rowFactsPrevLastReadMessageId: string | null | undefined = undefined;
let rowFactsPrevShowUnreadSeparator: boolean | undefined = undefined;
const rowFactsFingerprints = new Map<string, string>();
const rowInvalidation = createMessageListRowInvalidationController();
let pendingRowFactsRefreshAfterScroll = false;

function resetRowFactsFingerprints(
  ids: readonly string[],
  messages: Map<string, MessageWithAuthor & { channelName?: string }>,
  entities: ReadonlyMap<string, RawMessage>,
): void {
  rowFactsFingerprints.clear();
  for (const id of ids) {
    rowFactsFingerprints.set(
      id,
      fingerprintMessageListRowFactsInputs(id, messages, entities),
    );
  }
}

watch(
  () => ({
    ids: displayOrderedIds.value,
    entities: mergedEntitiesForList.value,
    messages: mergedMessagesForList.value,
    compactTop: !!props.compactTop,
    firstUnreadMessageId: props.firstUnreadMessageId ?? null,
    lastReadMessageId: props.lastReadMessageId ?? null,
    showUnreadSeparator: props.showUnreadSeparator !== false,
  }),
  (curr) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const {
      ids,
      entities,
      messages,
      compactTop,
      firstUnreadMessageId,
      lastReadMessageId,
      showUnreadSeparator,
    } = curr;
    const n = ids.length;

    if (
      (rowFactsPrevCompactTop !== undefined &&
        compactTop !== rowFactsPrevCompactTop) ||
      (rowFactsPrevShowUnreadSeparator !== undefined &&
        showUnreadSeparator !== rowFactsPrevShowUnreadSeparator)
    ) {
      messageListRowPresentations.value = buildMessageListRowPresentations(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        showUnreadSeparator,
      );
      resetRowFactsFingerprints(ids, messages, entities);
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      if (messageListDebugEnabled()) {
        console.log(
          `%c[MessageList] buildMessageListRowPresentations (compactTop change) took ${performance.now() - t0}ms for ${n} rows`,
          'color: #9c27b0',
        );
      }
      return;
    }

    if (
      rowFactsPrevFirstUnreadMessageId !== undefined &&
      firstUnreadMessageId !== rowFactsPrevFirstUnreadMessageId
    ) {
      messageListRowPresentations.value = buildMessageListRowPresentations(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        showUnreadSeparator,
      );
      resetRowFactsFingerprints(ids, messages, entities);
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      return;
    }

    if (
      rowFactsPrevLastReadMessageId !== undefined &&
      lastReadMessageId !== rowFactsPrevLastReadMessageId
    ) {
      messageListRowPresentations.value = buildMessageListRowPresentations(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        showUnreadSeparator,
      );
      resetRowFactsFingerprints(ids, messages, entities);
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      return;
    }

    const struct = describeOrderedIdsStructuralChange(
      rowFactsPrevOrderedIds,
      ids,
    );

    if (
      scrollOwnership.isUserActive() &&
      struct.kind === 'same' &&
      rowFactsPrevCompactTop === compactTop &&
      rowFactsPrevFirstUnreadMessageId === firstUnreadMessageId &&
      rowFactsPrevLastReadMessageId === lastReadMessageId &&
      rowFactsPrevShowUnreadSeparator === showUnreadSeparator
    ) {
      pendingRowFactsRefreshAfterScroll = true;
      rowInvalidation.invalidate('message_entity', ids, ids, true);
      return;
    }

    if (struct.kind === 'full') {
      if (performance.mark) performance.mark('messagelist-rebuild-start');
      messageListRowPresentations.value = buildMessageListRowPresentations(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        showUnreadSeparator,
      );
      resetRowFactsFingerprints(ids, messages, entities);
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      const dur = performance.now() - t0;
      if (messageListDebugEnabled()) {
        console.log(
          `%c[MessageList] buildMessageListRowPresentations (full struct change) took ${dur}ms for ${n} rows`,
          'color: #9c27b0',
        );
      }
      if (performance.mark && performance.measure) {
        performance.mark('messagelist-rebuild-end');
        performance.measure(
          'MessageListRebuildRows',
          'messagelist-rebuild-start',
          'messagelist-rebuild-end',
        );
      }
      return;
    }

    const changed = new Set<string>();
    for (const id of ids) {
      const fp = fingerprintMessageListRowFactsInputs(id, messages, entities);
      if (fp !== rowFactsFingerprints.get(id)) {
        changed.add(id);
        rowFactsFingerprints.set(id, fp);
      }
    }
    const idSet = new Set(ids);
    for (const k of rowFactsFingerprints.keys()) {
      if (!idSet.has(k)) rowFactsFingerprints.delete(k);
    }

    if (struct.kind === 'same' && changed.size === 0) {
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      return;
    }

    const patchIndices = new Set<number>();
    if (struct.kind === 'append_one') {
      for (const i of struct.patchIndices) patchIndices.add(i);
    } else if (struct.kind === 'prepend_one') {
      for (const i of struct.patchIndices) patchIndices.add(i);
    }
    for (const i of collectMessageListRowFactsPatchIndices(
      ids,
      messages,
      entities,
      changed,
    )) {
      patchIndices.add(i);
    }

    const arr = messageListRowPresentations.value;
    if (arr.length !== n) {
      messageListRowPresentations.value = buildMessageListRowPresentations(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        showUnreadSeparator,
      );
      resetRowFactsFingerprints(ids, messages, entities);
      rowFactsPrevOrderedIds = ids.slice();
      rowFactsPrevCompactTop = compactTop;
      rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
      rowFactsPrevLastReadMessageId = lastReadMessageId;
      rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
      return;
    }

    for (const i of patchIndices) {
      if (i < 0 || i >= n) continue;
      arr[i] = buildMessageListRowPresentationAtIndex(
        ids,
        messages,
        entities,
        compactTop,
        firstUnreadMessageId,
        lastReadMessageId,
        i,
        showUnreadSeparator,
      );
    }

    rowFactsPrevOrderedIds = ids.slice();
    rowFactsPrevCompactTop = compactTop;
    rowFactsPrevFirstUnreadMessageId = firstUnreadMessageId;
    rowFactsPrevLastReadMessageId = lastReadMessageId;
    rowFactsPrevShowUnreadSeparator = showUnreadSeparator;
    const dur = performance.now() - t0;
    messageListScrollMetricsApi()?.noteRowPresentationRebuild(dur);
    if (messageListDebugEnabled() && dur > 5) {
      console.log(
        `%c[MessageList] buildMessageListRowPresentations (patch change) took ${dur}ms for ${n} rows`,
        'color: #9c27b0',
      );
    }
  },
  /**
   * Render consumes display ids + `messageListRowPresentations` in the same pass.
   * Keep row derivation in the pre-render cycle so a channel switch cannot paint
   * virtual rows before their row view models exist.
   */
  { immediate: true },
);

/** True when there is nothing to scroll (canonical channel window — rollup does not invent messages). */
const isEmpty = computed(() => canonicalOrderedIds.value.length === 0);

/** One loading placeholder for empty channels — history fetch or shell transition. */
const showChannelLoadingPlaceholder = computed(
  () =>
    isEmpty.value &&
    ((!!props.initialHistoryLoading &&
      !!props.channelId &&
      isEchoGraphId(props.channelId)) ||
      !!props.transitionLoading ||
      (!props.hasChannel && !!props.guildShellSettling)),
);

const showLoadingSkeleton = showChannelLoadingPlaceholder;

const showNoServersYet = computed(
  () => !!props.noServersYet && isEmpty.value && !showLoadingSkeleton.value,
);

const discordMessageImportEligible = computed(
  () =>
    !!props.serverId &&
    !!props.canShowDiscordChannelImport &&
    !!props.isDiscordImportedServer &&
    !!props.discordChannelId &&
    props.channelType === 'text',
);

/** Loaded (or non-Echo) empty channel — not the initial history skeleton state. */
const showEmptyChannelHint = computed(
  () =>
    isEmpty.value &&
    !showLoadingSkeleton.value &&
    !props.guildShellSettling &&
    !showNoServersYet.value &&
    !discordMessageImportEligible.value &&
    !props.dmHistoryIntro,
);

const showDiscordImportWidget = computed(
  () =>
    isEmpty.value &&
    !showLoadingSkeleton.value &&
    !props.guildShellSettling &&
    !showNoServersYet.value &&
    discordMessageImportEligible.value,
);

const showDmHistoryIntro = computed(
  () =>
    isEmpty.value &&
    !!props.dmHistoryIntro &&
    !showLoadingSkeleton.value &&
    !props.guildShellSettling &&
    !showNoServersYet.value &&
    !showDiscordImportWidget.value,
);

if (import.meta.env.DEV) {
  type SkeletonSample = {
    startedAtMs: number;
    channelId: string | null;
  };
  let lastFirstMessageVisibleSwitchId = 0;

  const loadingSkeletonSample: SkeletonSample = {
    startedAtMs: 0,
    channelId: null,
  };

  function debugNowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function beginSkeletonSample(sample: SkeletonSample): void {
    if (sample.startedAtMs > 0) return;
    sample.startedAtMs = debugNowMs();
    sample.channelId = props.channelId?.trim() || null;
    logMessageList('history', 'loading_skeleton_visible_start', {
      channelId: sample.channelId,
      transitionLoading: !!props.transitionLoading,
      initialHistoryLoading: !!props.initialHistoryLoading,
      outcomeOk: true,
      expectation:
        'static skeleton overlay visible until initial anchor settles or channel loads',
    });
  }

  function finishSkeletonSample(
    sample: SkeletonSample,
    hideReason: 'hidden' | 'channel_change',
  ): void {
    if (sample.startedAtMs <= 0) return;
    const durationMs = Math.max(
      0,
      Math.round(debugNowMs() - sample.startedAtMs),
    );
    emitDiagnostic({
      level: 'info',
      domain: 'perf',
      event: 'message_list_loading_skeleton_visible',
      stage: 'success',
      durationMs,
      context: {
        channelId: sample.channelId,
        hideReason,
        finalMessageCount: displayOrderedIds.value.length,
        initialHistoryLoading: !!props.initialHistoryLoading,
        transitionLoading: !!props.transitionLoading,
      },
    });
    logMessageList('history', 'loading_skeleton_visible_end', {
      channelId: sample.channelId,
      durationMs,
      hideReason,
      finalMessageCount: displayOrderedIds.value.length,
      initialHistoryLoading: !!props.initialHistoryLoading,
      transitionLoading: !!props.transitionLoading,
      outcomeOk: true,
      expectation:
        'duration approximates the loading placeholder lifetime visible to the user',
    });
    sample.startedAtMs = 0;
    sample.channelId = null;
  }

  watch(
    () => props.channelId,
    (cid, prevCid) => {
      if (prevCid === undefined || prevCid === cid) return;
      finishSkeletonSample(loadingSkeletonSample, 'channel_change');
    },
  );

  watch(showLoadingSkeleton, (visible) => {
    if (visible) {
      beginSkeletonSample(loadingSkeletonSample);
      return;
    }
    finishSkeletonSample(loadingSkeletonSample, 'hidden');
  });

  watch(
    () => [props.channelId ?? '', displayOrderedIds.value.length] as const,
    ([channelId, count], prev) => {
      if (!channelId || count <= 0) return;
      if (prev && prev[0] === channelId && prev[1] > 0) return;
      const snapshot = getActiveChatSwitchSnapshot();
      if (!snapshot || snapshot.channelId !== channelId) return;
      if (snapshot.switchId === lastFirstMessageVisibleSwitchId) return;
      lastFirstMessageVisibleSwitchId = snapshot.switchId;
      emitChatSwitchEvent({
        event: 'chat_switch_first_message_visible',
        channelId,
        context: {
          messageCount: count,
          initialHistoryLoading: !!props.initialHistoryLoading,
          transitionLoading: !!props.transitionLoading,
        },
      });
    },
  );

  watch(
    () => ({
      channelId: props.channelId ?? null,
      isEmpty: isEmpty.value,
      showLoadingSkeleton: showLoadingSkeleton.value,
      showNoServersYet: showNoServersYet.value,
      discordMessageImportEligible: discordMessageImportEligible.value,
      showDiscordImportWidget: showDiscordImportWidget.value,
      canShowDiscordChannelImport: !!props.canShowDiscordChannelImport,
      isDiscordImportedServer: !!props.isDiscordImportedServer,
      hasDiscordChannelId: !!props.discordChannelId,
      channelType: props.channelType ?? null,
      messageCount: displayOrderedIds.value.length,
    }),
    (snapshot) => {
      emitDiagnostic({
        level: 'info',
        domain: 'ui',
        event: 'discord_import_widget_decision',
        stage: 'attempt',
        context: snapshot,
      });
    },
    { immediate: true },
  );
}

/**
 * Channel header is `absolute` over the list (`h-12` = 3rem); top padding must clear it.
 * `48px` keeps content below the glass header; `compactTop` skips this for voice side chat.
 * When messages are shown, add MESSAGE_LIST_ACTION_BAR_GUTTER_PX so hover action bars are not clipped.
 * When totally empty (no skeleton), match bottom padding for vertical centering.
 */
const scrollContainerPaddingTopPx = computed(() => {
  const gutter = !isEmpty.value ? MESSAGE_LIST_ACTION_BAR_GUTTER_PX : 0;
  if (
    typeof props.headerOverlayInsetPx === 'number' &&
    Number.isFinite(props.headerOverlayInsetPx) &&
    props.headerOverlayInsetPx > 0
  ) {
    return props.headerOverlayInsetPx + gutter;
  }
  let base = props.compactTop ? 12 : props.hasChannel ? 48 : 16;
  if (showDmHistoryIntro.value && coarsePointer.value) {
    base = Math.max(base, 52);
  }
  return base + gutter;
});

const scrollContainerPaddingBottomClass = computed(() => {
  if (!isEmpty.value || showLoadingSkeleton.value) return '';
  const bottom = props.compactTop
    ? 'pb-3'
    : props.hasChannel
      ? 'pb-12'
      : 'pb-4';
  return bottom;
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
const MESSAGE_LIST_OVERSCAN_IDLE = 24;
const MESSAGE_LIST_OVERSCAN_IDLE_COARSE = 24;
const MESSAGE_LIST_OVERSCAN_FAST = 10;
const MESSAGE_LIST_OVERSCAN_FAST_COARSE = 8;
const MESSAGE_LIST_ACTION_BAR_GUTTER_PX = 14;

function withProgrammaticScroll<T>(write: () => T): T {
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

let scrollJumpRaf: number | null = null;
/** Coalesces load-older + jump UI to one rAF — never run that work on the scroll event itself. */
let scrollIdleRaf: number | null = null;
let viewportMemoryRaf: number | null = null;
let lastObservedScrollTop = 0;
let lastObservedScrollDirection: 'up' | 'down' | 'still' = 'still';
let suppressLoadOlderUntilLeaveTopZone = false;
/** Bumps on channel change and each `applyInitialScrollAnchor` call — stale rAF work bails (max one commit pass wins). */
let initialAnchorScheduleGeneration = 0;
/** De-dupe deferred row measurement: at most one pending measure per row key. */
const measureRowPendingKeys = new Set<string>();
/** Skip re-measure for stable rows whose rendered height did not change. */
const measureRowLastHeightByKey = new Map<string, number>();
/** Row resize remeasures deferred while the user scrolls (flushed on settle). */
const rowResizeMeasureDeferredKeys = new Set<string>();
/** Tracks mounted virtual row roots for ResizeObserver attach/detach. */
const virtualRowElementByKey = new Map<string, Element>();
/** Observes hydrated rows for async height growth (embed images, iframes, expand). */
let rowResizeObserver: ResizeObserver | null = null;
const rowResizeObservedElements = new Set<Element>();

function resolveMeasureRowElement(
  el: Element | ComponentPublicInstance | null,
): Element | null {
  if (!el) return null;
  const node =
    typeof el === 'object' && '$el' in el
      ? (el as ComponentPublicInstance).$el
      : el;
  return node instanceof Element ? node : null;
}

function disconnectRowResizeObserver(): void {
  rowResizeObserver?.disconnect();
  rowResizeObserver = null;
  rowResizeObservedElements.clear();
  virtualRowElementByKey.clear();
  rowResizeMeasureDeferredKeys.clear();
}

function ensureRowResizeObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') return null;
  if (!rowResizeObserver) {
    rowResizeObserver = new ResizeObserver((entries) => {
      resizeDeferMetrics.resizeObserverCallbackCount += entries.length;
      for (const entry of entries) {
        const el = entry.target;
        if (!(el instanceof HTMLElement) || !el.isConnected) continue;
        const h = entry.contentRect.height;
        const deferKey = measureKeyForElement(el);
        if (deferKey) {
          const slotH = measureRowLastHeightByKey.get(deferKey) ?? null;
          unresolvedResizeDeltaByKey.set(
            deferKey,
            computeUnresolvedResizeDeltaPx(slotH, h),
          );
        }
        scheduleVirtualRowMeasure(el, 'resize');
      }
    });
  }
  return rowResizeObserver;
}

function unobserveVirtualRowElement(element: Element): void {
  if (!rowResizeObservedElements.has(element)) return;
  rowResizeObserver?.unobserve(element);
  rowResizeObservedElements.delete(element);
}

function observeVirtualRowElement(element: Element): void {
  const ro = ensureRowResizeObserver();
  if (!ro || rowResizeObservedElements.has(element)) return;
  rowResizeObservedElements.add(element);
  ro.observe(element);
}

function messageIdForVirtualIndex(virtualIndex: number): string | null {
  if (isPrependSkeletonVirtualIndex(virtualIndex)) return null;
  const messageIndex = virtualIndexToMessageIndex(virtualIndex);
  return displayOrderedIds.value[messageIndex]?.trim() || null;
}

function measureKeyForVirtualIndex(virtualIndex: number): string {
  const cid = props.channelId?.trim() ?? '';
  const messageId = messageIdForVirtualIndex(virtualIndex);
  return cid && messageId ? `${cid}:${messageId}` : '';
}

function measureKeyForElement(element: Element): string {
  return element.getAttribute('data-measure-key')?.trim() ?? '';
}

function syncVirtualRowResizeObservation(
  element: Element,
  virtualIndex: number,
): void {
  const measureKey = measureKeyForVirtualIndex(virtualIndex);
  if (!measureKey) return;
  element.setAttribute('data-measure-key', measureKey);
  for (const [key, observed] of virtualRowElementByKey) {
    if (observed === element && key !== measureKey) {
      virtualRowElementByKey.delete(key);
    }
  }
  const prev = virtualRowElementByKey.get(measureKey);
  if (prev && prev !== element) {
    unobserveVirtualRowElement(prev);
  }
  virtualRowElementByKey.set(measureKey, element);
  observeVirtualRowElement(element);
}

function detachVirtualRowResizeObservation(virtualIndex: number): void {
  const measureKey = measureKeyForVirtualIndex(virtualIndex);
  if (!measureKey) return;
  const prev = virtualRowElementByKey.get(measureKey);
  if (prev) {
    unobserveVirtualRowElement(prev);
    virtualRowElementByKey.delete(measureKey);
  }
}
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

function estimateMessageRowSizeForMessage(messageIndex: number): number {
  const msgId = displayOrderedIds.value[messageIndex];
  const message = msgId ? mergedMessagesForList.value.get(msgId) : undefined;
  if (!message) return MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX;

  const rowVm = messageListRowPresentations.value[messageIndex];
  const groupedWithPrevious = rowVm?.layout.groupedWithPrevious ?? false;
  const showDaySeparatorBefore =
    rowVm?.showDaySeparatorBefore ??
    shouldShowDaySeparatorBefore(
      displayOrderedIds.value,
      mergedMessagesForList.value,
      messageIndex,
    );

  const estimate = estimateMessageListRowSizePx({
    groupedWithPrevious,
    showDaySeparatorBefore,
    message,
  });
  if (!msgId || !rowVm) return estimate;
  const revisionKey = buildMessageRowRevisionKey(rowVm, message);
  return (
    getCachedMessageRowHeightPx(props.channelId, msgId, revisionKey) ?? estimate
  );
}

function revisionKeyForMessageIndex(messageIndex: number): string | null {
  const msgId = displayOrderedIds.value[messageIndex];
  const message = msgId ? mergedMessagesForList.value.get(msgId) : undefined;
  const rowVm = messageListRowPresentations.value[messageIndex];
  if (!message || !rowVm) return null;
  return buildMessageRowRevisionKey(rowVm, message);
}

function estimateMessageRowSize(virtualIndex: number): number {
  if (isPrependSkeletonVirtualIndex(virtualIndex)) {
    return estimatePrependSkeletonRowSizePx(
      virtualIndex,
      MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX,
    );
  }
  return estimateMessageRowSizeForMessage(
    virtualIndexToMessageIndex(virtualIndex),
  );
}

const virtualizerScrollPaddingStart = computed(
  () => scrollContainerPaddingTopPx.value,
);

/**
 * Estimated total scrollable height (padding + row estimates) before live measurement.
 * Used for `initialOffset` so the first paint can start at the bottom for long channels
 * instead of flashing the top and scrolling down on the next frame.
 */
function estimateVirtualListTotalSizePx(): number {
  const n = virtualizerOrderedIds.value.length;
  let sum = virtualizerScrollPaddingStart.value + 16;
  for (let i = 0; i < n; i++) {
    sum += estimateMessageRowSize(i);
  }
  return sum;
}

/** First-paint scroll offset that pins the list to the estimated bottom. */
function estimateInitialOffsetAtBottomPx(): number {
  const n = displayOrderedIds.value.length;
  if (n === 0) return 0;
  const estimated = estimateVirtualListTotalSizePx();
  const el = containerRef.value;
  const viewport = el?.clientHeight ?? 0;
  if (viewport <= 0) {
    const h =
      typeof window !== 'undefined'
        ? Math.max(200, Math.floor(window.innerHeight * 0.45))
        : 400;
    return Math.max(0, estimated - h);
  }
  return Math.max(0, estimated - viewport);
}

/** Stable moderate overscan when experiment C is on; otherwise legacy idle/fast split. */
function resolveMessageListOverscan(): number {
  const idleOverscan = coarsePointer.value
    ? MESSAGE_LIST_OVERSCAN_IDLE_COARSE
    : MESSAGE_LIST_OVERSCAN_IDLE;
  const fastOverscan = coarsePointer.value
    ? MESSAGE_LIST_OVERSCAN_FAST_COARSE
    : MESSAGE_LIST_OVERSCAN_FAST;
  if (scrollExperiments.stableModerateOverscan) {
    const stable = scrollExperiments.stableOverscanPx;
    if (olderFetchSkeletonActive.value) return stable * 2;
    return safariLikeBrowser ? Math.max(stable, idleOverscan) : stable;
  }
  if (olderFetchSkeletonActive.value) {
    return deferFullRowHydration.value
      ? (safariLikeBrowser ? idleOverscan : fastOverscan) * 2
      : idleOverscan * 2;
  }
  if (deferFullRowHydration.value) {
    return safariLikeBrowser ? idleOverscan : fastOverscan;
  }
  return idleOverscan;
}

const messageListOverscan = computed(() => resolveMessageListOverscan());

const virtualizerMeasurementsCache = shallowRef(
  buildInitialMeasurementsCacheForChannel(
    props.channelId,
    virtualizerOrderedIds.value,
    estimateMessageRowSize,
    () => false,
  ),
);

watch(
  () =>
    [
      props.channelId,
      virtualizerOrderedIds.value.length,
      displayOrderedIds.value.join('\u001e'),
    ] as const,
  () => {
    virtualizerMeasurementsCache.value =
      buildInitialMeasurementsCacheForChannel(
        props.channelId,
        virtualizerOrderedIds.value,
        estimateMessageRowSize,
        (index) => {
          const messageIndex = virtualIndexToMessageIndex(index);
          const messageId = displayOrderedIds.value[messageIndex]?.trim();
          const revisionKey = revisionKeyForMessageIndex(messageIndex);
          if (!messageId || !revisionKey) return false;
          return (
            getCachedMessageRowHeightPx(
              props.channelId,
              messageId,
              revisionKey,
            ) != null
          );
        },
      );
  },
  { immediate: true },
);

/** Virtual list: display ids (may include DM call-log rollup row); row identity = message id (viewport contract). */
const virtualizerOptions = computed(() => ({
  count: virtualizerOrderedIds.value.length,
  getScrollElement: () => containerRef.value,
  estimateSize: estimateMessageRowSize,
  overscan: messageListOverscan.value,
  useCachedMeasurements: true,
  initialMeasurementsCache: virtualizerMeasurementsCache.value,
  scrollPaddingStart: virtualizerScrollPaddingStart.value,
  scrollPaddingEnd: 16,
  /** TanStack row identity: message id string only — no index, no composite, no revision churn. */
  getItemKey: (index: number) => virtualizerOrderedIds.value[index] ?? '',
  /**
   * Reset when switching channels and when the window goes from empty → first messages.
   * The empty/has suffix ensures a fresh virtualizer on first history paint so
   * `initialOffset` applies (TanStack only uses it on instance creation).
   */
  orderKey: `${props.channelId?.trim() ?? ''}:${displayOrderedIds.value.length > 0 ? 'm' : 'e'}`,
  /**
   * Start at the bottom on first paint for bottom-anchored channels so we do not flash
   * the top of a long thread and scroll down on the following frame.
   */
  initialOffset: () => {
    const cid = props.channelId?.trim();
    const saved = cid ? readMessageListViewport(cid) : null;
    return resolveMessageListInitialOffsetPx({
      saved,
      orderedIds: displayOrderedIds.value,
      estimateOffsetToAnchor: (anchorIndex, anchorTop) => {
        let offset = 0;
        for (let i = 0; i < anchorIndex; i++) {
          offset += estimateMessageRowSizeForMessage(i);
        }
        return offset - anchorTop;
      },
      estimateBottomOffset: estimateInitialOffsetAtBottomPx,
    });
  },
  /**
   * Two cases compensate; otherwise we leave the row where it is.
   *
   * 1. Rows ABOVE the current offset: scrolling up into unmeasured history is where
   *    estimate→measure deltas used to shift content under the user (the "background
   *    flashes before messages appear" bug). Compensating holds the row under the
   *    user's eyes fixed.
   * 2. Following tail + idle: when we are following the tail and the user is not
   *    actively scrolling, a row growing (late image/GIF decode) should push earlier
   *    content UP and keep the bottom pinned — otherwise a late image on initial load
   *    pushes the newest messages below the fold and we drift off the bottom. Gated on
   *    `!isUserActive()` so it never fights an in-progress wheel/touch gesture.
   */
  shouldAdjustScrollPositionOnItemSizeChange: (
    item: { start: number },
    delta: number,
    instance: { scrollOffset: number | null; scrollDirection?: string | null },
  ) => {
    scrollCompensation.noteWheelDirection(lastObservedScrollDirection);
    return resolveShouldAdjustScrollPosition(
      {
        delta,
        itemStart: item.start,
        scrollOffset: instance.scrollOffset ?? null,
        scrollDirection: instance.scrollDirection,
        lastObservedScrollDirection,
        isUserActive: scrollOwnership.isUserActive(),
        prependTransactionActive: prependTransactionActive.value,
        followNewMessagesToBottom: followNewMessagesToBottom.value,
        experimentEnabled: scrollExperiments.compensationAnchorReconcile,
      },
      scrollCompensation,
      captureScrollCompensationAnchor,
    );
  },
}));

function distanceFromBottomPx(): number {
  const el = containerRef.value;
  const v = virtualizer.value;
  if (!el || !v) return 0;
  return Math.max(0, v.getTotalSize() - el.scrollTop - el.clientHeight);
}

function persistViewportMemoryForChannel(
  channelId: string | null | undefined = props.channelId,
): void {
  const cid = channelId?.trim();
  if (cid && isClientOnlyDmOpenShellChannelId(cid)) return;
  const el = containerRef.value;
  const virtualItems = virtualizer.value?.getVirtualItems() ?? [];
  if (
    !cid ||
    !el ||
    displayOrderedIds.value.length === 0 ||
    virtualItems.length === 0 ||
    suppressListUntilInitialAnchor.value
  ) {
    return;
  }

  const anchor = getAnchorMessageIdFromViewport(
    el,
    virtualItems,
    displayOrderedIds.value,
    props.messages,
  );
  if (!anchor) return;
  const anchorTop = measureMessageTopInContainer(el, anchor.anchorMessageId);
  if (anchorTop == null) return;

  writeMessageListViewport(cid, {
    anchorMessageId: anchor.anchorMessageId,
    anchorTop,
    followNewMessages: followNewMessagesToBottom.value,
  });

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_saved', {
      channelId: cid,
      anchorMessageId: anchor.anchorMessageId,
      anchorTop,
      followNewMessages: followNewMessagesToBottom.value,
      messageCount: displayOrderedIds.value.length,
      outcomeOk: true,
      expectation:
        'channel restore reuses this anchor instead of defaulting to latest',
    });
  }
}

function schedulePersistViewportMemory(): void {
  if (viewportMemoryRaf != null) return;
  viewportMemoryRaf = requestAnimationFrame(() => {
    viewportMemoryRaf = null;
    persistViewportMemoryForChannel();
  });
}

async function ensureAnchorMessageInWindow(
  channelId: string,
  anchorMessageId: string,
): Promise<boolean> {
  if (displayOrderedIds.value.includes(anchorMessageId)) return true;
  const ensure = props.ensureMessageInWindow;
  if (!ensure) return false;
  try {
    const ok = await ensure(anchorMessageId);
    if (props.channelId?.trim() !== channelId) return false;
    return ok && displayOrderedIds.value.includes(anchorMessageId);
  } catch {
    return false;
  }
}

async function restoreViewportMemoryForChannel(
  channelId: string,
): Promise<boolean> {
  if (isClientOnlyDmOpenShellChannelId(channelId)) return false;
  const entry = readMessageListViewport(channelId);
  if (!entry || displayOrderedIds.value.length === 0) return false;

  followNewMessagesToBottom.value = entry.followNewMessages;

  if (entry.followNewMessages) {
    if (!scrollOwnership.canCommit('viewport-restore')) return false;
    let restored = false;
    for (let attempt = 0; attempt < VIEWPORT_RESTORE_DOM_RETRY; attempt++) {
      await nextTick();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!scrollOwnership.canCommit('viewport-restore')) return false;
      const v = virtualizer.value;
      if (!v || displayOrderedIds.value.length === 0) continue;
      commitScrollToLatest({
        forceScrollToIndex: true,
        intent: 'viewport-restore',
      });
      if (distanceFromBottomPx() < FOLLOW_NEW_ATTACH_PX) {
        restored = true;
        break;
      }
    }
    if (!restored) return false;

    persistViewportMemoryForChannel(channelId);

    if (messageListDebugEnabled()) {
      logMessageList('viewport_memory', 'viewport_memory_restored', {
        channelId,
        anchorMessageId: entry.anchorMessageId,
        anchorTopBefore: entry.anchorTop,
        followNewMessages: entry.followNewMessages,
        messageCount: displayOrderedIds.value.length,
        outcomeOk: true,
        expectation:
          'returning to a channel at the tail restores the bottom, not an anchor estimate',
      });
    }
    return true;
  }

  if (!displayOrderedIds.value.includes(entry.anchorMessageId)) {
    const loaded = await ensureAnchorMessageInWindow(
      channelId,
      entry.anchorMessageId,
    );
    if (!loaded || !displayOrderedIds.value.includes(entry.anchorMessageId)) {
      clearMessageListViewport(channelId);
      return false;
    }
    if (!scrollOwnership.canCommit('viewport-restore')) return false;
  }

  let restored = false;
  for (let attempt = 0; attempt < VIEWPORT_RESTORE_DOM_RETRY; attempt++) {
    await nextTick();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    // Restore spans several frames; if the user grabs the scroll mid-restore,
    // abandon it rather than yank them back to the saved anchor.
    if (!scrollOwnership.canCommit('viewport-restore')) return false;
    const el = containerRef.value;
    const v = virtualizer.value;
    if (!el || !v) continue;
    restored = withProgrammaticScroll(() =>
      restoreViewportAnchorInContainer(el, displayOrderedIds.value, v, {
        anchorMessageId: entry.anchorMessageId,
        anchorTop: entry.anchorTop,
      }),
    );
    if (restored) break;
  }
  if (!restored) return false;

  persistViewportMemoryForChannel(channelId);

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_restored', {
      channelId,
      anchorMessageId: entry.anchorMessageId,
      anchorTopBefore: entry.anchorTop,
      followNewMessages: entry.followNewMessages,
      messageCount: displayOrderedIds.value.length,
      outcomeOk: true,
      expectation:
        'returning to a channel restores the prior viewport instead of jumping',
    });
  }

  return true;
}

function updateJumpUiFromScroll() {
  if (prependTransactionActive.value) return;
  scrollJumpRaf = null;
  const v = virtualizer.value;
  const totalMsgs = displayOrderedIds.value.length;
  const virtualItems = v?.getVirtualItems() ?? [];
  const lastVisibleIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1]!.index
      : totalMsgs - 1;
  const hiddenFromBottom = Math.max(0, totalMsgs - 1 - lastVisibleIndex);
  const scrollAway = hiddenFromBottom >= BOTTOM_JUMP_SHOW_MESSAGES;
  if (jumpUi.scrollAwayFromBottom.value !== scrollAway) {
    jumpUi.scrollAwayFromBottom.value = scrollAway;
  }
  const d = distanceFromBottomPx();
  if (d > FOLLOW_NEW_DETACH_PX) followNewMessagesToBottom.value = false;
  else if (d < FOLLOW_NEW_ATTACH_PX) followNewMessagesToBottom.value = true;
  if (d < NEAR_BOTTOM_PX && jumpUi.pendingNewWhileAway.value !== 0) {
    jumpUi.pendingNewWhileAway.value = 0;
  }
}

/** Non-scroll paths (e.g. jump-to-bottom) — still one rAF, no scroll listener work. */
function scheduleJumpUiFromScroll() {
  if (prependTransactionActive.value) return;
  if (scrollJumpRaf != null) return;
  scrollJumpRaf = requestAnimationFrame(() => {
    scrollJumpRaf = null;
    updateJumpUiFromScroll();
  });
}

function scheduleScrollIdleWork(): void {
  if (scrollIdleRaf != null) return;
  scrollIdleRaf = requestAnimationFrame(() => {
    scrollIdleRaf = null;
    flushScrollSideEffects();
  });
}

/** Load-older eligibility + jump FAB state; virtualizer reads happen here, not in `onScrollCombined`. */
function flushScrollSideEffects(): void {
  emitSeenMessageId(resolveSeenMessageId());
  if (prependTransactionActive.value) {
    logMessageListThrottled(
      'flush_skip_prepend',
      250,
      'scroll',
      'scroll_idle_flush_skipped',
      {
        reason: 'prepend_transaction_active',
        activeTxId: activePrependTxId.value,
      },
    );
    return;
  }
  const el = containerRef.value;
  const scrollTop = el?.scrollTop;
  runLoadOlderIfEligible();
  updateJumpUiFromScroll();
  logMessageListThrottled(
    'scroll_idle_flush',
    400,
    'scroll',
    'scroll_idle_flush',
    {
      scrollTop,
      direction: lastObservedScrollDirection,
      distFromBottomPx: distanceFromBottomPx(),
      jumpScrollAway: jumpUi.scrollAwayFromBottom.value,
      jumpPendingNew: jumpUi.pendingNewWhileAway.value,
      nearTopWillConsiderLoadOlder: (scrollTop ?? 0) <= NEAR_TOP_PX,
      expectation:
        'after flush: jump UI reflects viewport; load older may run if gated conditions pass',
    },
  );
  schedulePersistViewportMemory();
  if (!deferFullRowHydration.value) {
    rowHydration.scheduleHydrationPass();
  }
}

/**
 * Scroll listener: cheap state only (position, direction, user-scroll window).
 * Does not interpret message semantics or history membership — see viewport contract.
 * Heavy follow-up is coalesced via {@link scheduleScrollIdleWork}.
 */
function onScrollCombined() {
  const t0 = nowMs();
  const el = containerRef.value;
  const nextScrollTop = el?.scrollTop ?? 0;
  lastObservedScrollDirection = getScrollDirection(
    lastObservedScrollTop,
    nextScrollTop,
  );
  scrollCompensation.noteWheelDirection(lastObservedScrollDirection);
  lastObservedScrollTop = nextScrollTop;
  if (prependTransactionActive.value) return;
  const scrollClassification = scrollOwnership.noteScrollEvent();
  // Only defer embed hydration / heavy remeasure for genuine user scrolls — programmatic
  // compensation and initialOffset echoes must not keep embeds hidden indefinitely.
  if (scrollClassification === 'user') {
    markScrollHydrationDeferral();
  }
  scheduleScrollIdleWork();
  const handlerMs = nowMs() - t0;
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
function onUserScrollGesture() {
  if (prependTransactionActive.value) return;
  scrollOwnership.markUserGesture();
  markScrollHydrationDeferral();
}

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

function onKeydownScrollGesture(event: KeyboardEvent) {
  if (!NAVIGATION_SCROLL_KEYS.has(event.key)) return;
  onUserScrollGesture();
}

/** Wheel at scrollTop≈0 does not emit scroll events — treat as upward pagination intent. */
function onWheelNearTopForLoadOlder(event: WheelEvent) {
  const el = containerRef.value;
  if (!el || prependTransactionActive.value) return;
  if (event.deltaY >= 0) return;
  if (el.scrollTop > NEAR_TOP_PX) return;
  lastObservedScrollDirection = 'up';
  scheduleScrollIdleWork();
}

/**
 * USER-INTENT SCROLL (1 of 3 surviving programmatic writes; the others are the own-message
 * send branch in the new-message watcher and {@link scrollMessageIntoView} for reply / link
 * jumps). These are direct user actions — always authorized by scroll ownership — and are the
 * only writes that remain once the passive authorities are gone. Everything else is initial
 * load state (`initialOffset` + the loading overlay).
 */
function jumpToLatestMessages() {
  followNewMessagesToBottom.value = true;
  jumpUi.pendingNewWhileAway.value = 0;
  scrollToBottom(true, 'user-intent');
  requestAnimationFrame(() => {
    scheduleJumpUiFromScroll();
  });
}

const containerRef = ref<HTMLElement | null>(null);

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
  });
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
    lastObservedScrollTop = el.scrollTop;
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
    const userScrollingUpForMore = lastObservedScrollDirection === 'up';
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
          direction: lastObservedScrollDirection,
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
  if (!allowWithoutUpScroll && lastObservedScrollDirection !== 'up') {
    logMessageListThrottled(
      'scroll_not_up',
      220,
      'scroll',
      'loadOlder_skipped',
      {
        reason: 'not_scrolling_up',
        direction: lastObservedScrollDirection,
        scrollTop: el.scrollTop,
      },
    );
    return;
  }
  logMessageList('scroll', 'loadOlder_trigger', {
    scrollTop: el.scrollTop,
    direction: lastObservedScrollDirection,
    scrollHeight: el.scrollHeight,
  });
  void loadOlderWithTransaction();
}

const virtualizer = useVirtualizer(
  virtualizerOptions as Parameters<typeof useVirtualizer>[0],
);
const virtualizerTotalSize = computed(() => virtualizer.value.getTotalSize());
const virtualizerItems = computed(() => virtualizer.value.getVirtualItems());

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
  if (!anchor || !scrollExperiments.compensationAnchorReconcile) {
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

flushPendingRowFactsAfterScrollSettleImpl = () => {
  if (!pendingRowFactsRefreshAfterScroll) return;
  pendingRowFactsRefreshAfterScroll = false;
  rowInvalidation.flushDeferredToImmediate();
  const dirtyIds = rowInvalidation.drain(false);
  if (dirtyIds.length === 0) return;
  const ids = displayOrderedIds.value;
  const messages = mergedMessagesForList.value;
  const entities = mergedEntitiesForList.value;
  const arr = messageListRowPresentations.value;
  if (arr.length !== ids.length) return;
  const idToIndex = new Map(ids.map((id, i) => [id, i]));
  const patchIndices = new Set<number>();
  for (const id of dirtyIds) {
    const i = idToIndex.get(id);
    if (i != null) patchIndices.add(i);
  }
  for (const i of collectMessageListRowFactsPatchIndices(
    ids,
    messages,
    entities,
    new Set(dirtyIds),
  )) {
    patchIndices.add(i);
  }
  for (const i of patchIndices) {
    if (i < 0 || i >= ids.length) continue;
    arr[i] = buildMessageListRowPresentationAtIndex(
      ids,
      messages,
      entities,
      !!props.compactTop,
      props.firstUnreadMessageId ?? null,
      props.lastReadMessageId ?? null,
      i,
      props.showUnreadSeparator !== false,
    );
    const id = ids[i];
    if (id) {
      rowFactsFingerprints.set(
        id,
        fingerprintMessageListRowFactsInputs(id, messages, entities),
      );
    }
  }
  scheduleHydratedRowRemeasure(
    [...patchIndices].map((i) => ids[i]!).filter(Boolean),
  );
};

let prevVirtualizerItemKeySignature = '';
watch(virtualizerItems, (items) => {
  const sig = items.map((i) => i.key).join(',');
  if (sig !== prevVirtualizerItemKeySignature) {
    prevVirtualizerItemKeySignature = sig;
    messageListScrollMetricsApi()?.noteVirtualizerRangeChange();
  }
  messageListScrollMetricsApi()?.noteMountedRowCount(items.length);
});

const rowHydration = useMessageRowHydration({
  channelId: () => props.channelId,
  isUserScrollActive: () =>
    (!safariLikeBrowser && scrollOwnership.isUserActive()) ||
    suppressListUntilInitialAnchor.value ||
    !scrollOwnership.isInitialAnchorSettled(),
  getVisibleMessageIds: () => {
    const items = virtualizer.value?.getVirtualItems() ?? [];
    const ids: string[] = [];
    for (const item of items) {
      if (isPrependSkeletonVirtualIndex(item.index)) continue;
      const messageId = messageIdForVirtualIndex(item.index);
      if (messageId) ids.push(messageId);
    }
    return ids;
  },
});

function ensureVirtualRowHydrated(virtualIndex: number): void {
  const messageId = messageIdForVirtualIndex(virtualIndex);
  if (!messageId || rowHydration.isRowHydrated(messageId)) return;
  rowHydration.forceHydrateMessage(messageId);
}

function hydrateVisibleVirtualRows(): void {
  for (const item of virtualizer.value?.getVirtualItems() ?? []) {
    if (isPrependSkeletonVirtualIndex(item.index)) continue;
    ensureVirtualRowHydrated(item.index);
  }
}

function invalidateRowMeasureStateForMessage(
  channelId: string,
  messageId: string,
): void {
  invalidateMessageRowHeight(channelId, messageId);
  const measureKey = `${channelId}:${messageId}`;
  measureRowLastHeightByKey.delete(measureKey);
  measureRowPendingKeys.delete(measureKey);
}

function remeasureVisibleVirtualRows(options: { force?: boolean } = {}): void {
  const cid = props.channelId?.trim();
  if (!cid) return;
  for (const item of virtualizer.value?.getVirtualItems() ?? []) {
    if (isPrependSkeletonVirtualIndex(item.index)) continue;
    const messageId = messageIdForVirtualIndex(item.index);
    if (!messageId) continue;
    if (options.force) {
      invalidateRowMeasureStateForMessage(cid, messageId);
    }
    const rowEl = virtualRowElementByKey.get(`${cid}:${messageId}`);
    if (rowEl) {
      scheduleVirtualRowMeasure(rowEl, 'resize', { force: options.force });
    }
  }
}

function scheduleHydratedRowRemeasure(messageIds: readonly string[]): void {
  const cid = props.channelId?.trim();
  if (!cid || messageIds.length === 0) return;
  const idSet = new Set(messageIds.map((id) => id.trim()).filter(Boolean));
  for (const item of virtualizer.value?.getVirtualItems() ?? []) {
    if (isPrependSkeletonVirtualIndex(item.index)) continue;
    const messageId = messageIdForVirtualIndex(item.index);
    if (!messageId || !idSet.has(messageId)) continue;
    invalidateRowMeasureStateForMessage(cid, messageId);
  }
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = containerRef.value;
      if (!el) return;
      for (const item of virtualizer.value?.getVirtualItems() ?? []) {
        if (isPrependSkeletonVirtualIndex(item.index)) continue;
        const messageId = messageIdForVirtualIndex(item.index);
        if (!messageId || !idSet.has(messageId)) continue;
        if (!rowHydration.isRowHydrated(messageId)) continue;
        const rowEl = virtualRowElementByKey.get(`${cid}:${messageId}`);
        if (rowEl) {
          syncVirtualRowResizeObservation(rowEl, item.index);
          scheduleVirtualRowMeasure(rowEl, 'resize');
        }
      }
    });
  });
}

function flushDeferredRowResizeMeasures(): void {
  const t0 = nowMs();
  resizeDeferMetrics.deferredKeysAtSettle = rowResizeMeasureDeferredKeys.size;
  if (rowResizeMeasureDeferredKeys.size === 0) return;
  const keys = [...rowResizeMeasureDeferredKeys];
  rowResizeMeasureDeferredKeys.clear();
  for (const key of keys) {
    unresolvedResizeDeltaByKey.delete(key);
    const rowEl = virtualRowElementByKey.get(key);
    if (rowEl) scheduleVirtualRowMeasure(rowEl, 'resize', { force: true });
  }
  const dur = nowMs() - t0;
  resizeDeferMetrics.settleFlushDurationMs = dur;
  resizeDeferMetrics.settleFlushDurationMaxMs = Math.max(
    resizeDeferMetrics.settleFlushDurationMaxMs,
    dur,
  );
  messageListScrollMetricsApi()?.mergeResizeDeferMetrics(resizeDeferMetrics);
}

function finishScrollHydrationSettle(): void {
  deferFullRowHydration.value = false;
  syncScrollGestureSurface(false);
  rowHydration.onScrollActivityChanged(false);
  flushDeferredRowResizeMeasures();
  remeasureVisibleVirtualRows({ force: true });
  applyAnchorReconcileAtSettle();
  flushPendingRowFactsAfterScrollSettle();
  messageListScrollMetricsApi()?.mergeCompensationMetrics(
    scrollCompensation.getMetrics(),
  );
  rowHydration.scheduleHydrationPass();
}

function markScrollHydrationDeferral(): void {
  syncScrollGestureSurface(true);
  if (safariLikeBrowser) {
    rowHydration.scheduleHydrationPass();
  } else {
    deferFullRowHydration.value = true;
  }
  if (hydrationSettleTimer != null) clearTimeout(hydrationSettleTimer);
  hydrationSettleTimer = setTimeout(() => {
    hydrationSettleTimer = null;
    finishScrollHydrationSettle();
  }, USER_SCROLL_SETTLE_MS);
}

if (import.meta.env.DEV) {
  watch(
    () => ({
      channelId: props.channelId ?? null,
      count: displayOrderedIds.value.length,
      overscan: resolveMessageListOverscan(),
      channelIndexOrderRevision: null,
      hasChannelIndex: !!activeChannelIndex.value,
    }),
    (snapshot) => {
      emitDiagnostic({
        level: 'info',
        domain: 'ui',
        event: 'message_list_virtualizer_options',
        stage: 'attempt',
        context: snapshot,
      });
    },
    { immediate: true },
  );
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

/**
 * True from channel-change until the first anchor settles. The list still renders and
 * measures underneath (never gate the list's existence on this — it would unmount the
 * virtualizer); the loading overlay just stays drawn over it so the one-shot bottom-anchor
 * and any remembered-position restore happen out of sight. See {@link showInitialLoadOverlay}.
 */
const suppressListUntilInitialAnchor = ref(false);

/**
 * True only for a COLD channel open — one with no cached content at switch time. Set from
 * `isEmpty` in the channel-change watcher (the window updates synchronously on switch, so
 * `isEmpty` is already correct there). A warm switch to a cached channel leaves this false, so
 * the overlay never covers cached content during the anchor settle.
 */
const coldLoadInProgress = ref(false);

/** Failsafe: never leave the cold-load overlay up if anchor work stalls. */
const INITIAL_ANCHOR_OVERLAY_SAFETY_MS = 2500;
let initialAnchorOverlaySafetyTimer: ReturnType<typeof setTimeout> | null =
  null;

function disarmInitialAnchorOverlaySafety(): void {
  if (initialAnchorOverlaySafetyTimer != null) {
    clearTimeout(initialAnchorOverlaySafetyTimer);
    initialAnchorOverlaySafetyTimer = null;
  }
}

function armInitialAnchorOverlaySafety(channelId: string | null): void {
  disarmInitialAnchorOverlaySafety();
  if (!channelId) return;
  initialAnchorOverlaySafetyTimer = setTimeout(() => {
    initialAnchorOverlaySafetyTimer = null;
    if (!suppressListUntilInitialAnchor.value) return;
    logMessageList('initial_anchor', 'initial_anchor_overlay_safety_release', {
      channelId,
      messageCount: displayOrderedIds.value.length,
      initialHistoryLoading: !!props.initialHistoryLoading,
      outcomeOk: false,
      expectation:
        'overlay released after safety timeout — anchor should have settled sooner',
    });
    coldLoadInProgress.value = false;
    suppressListUntilInitialAnchor.value = false;
    scrollOwnership.markInitialAnchorSettled();
  }, INITIAL_ANCHOR_OVERLAY_SAFETY_MS);
}

/**
 * The loading skeleton is held over the list until the initial position settles — but ONLY for a
 * cold open. For a cold channel this makes the initial position (latest, or a remembered spot
 * restored across frames) **load state, not a visible scroll**: positioning finishes behind the
 * overlay, then it cross-fades to reveal messages in place.
 *
 * Warm switches keep this false and paint cached content immediately; their remembered position
 * comes from the virtualizer's first-paint `initialOffset`.
 */
const showInitialLoadOverlay = computed(
  () =>
    showLoadingSkeleton.value ||
    (coldLoadInProgress.value &&
      suppressListUntilInitialAnchor.value &&
      !isEmpty.value &&
      !!props.channelId),
);

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
        coldLoadInProgress.value = false;
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
const _voteHandlerCache = new Map<string, (optId: string) => void>();
const _reactHandlerCache = new Map<string, (emoji: string) => void>();
const _pinHandlerCache = new Map<string, () => void>();
const _unpinHandlerCache = new Map<string, () => void>();

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
    measureRowPendingKeys.clear();
    measureRowLastHeightByKey.clear();
    disconnectRowResizeObserver();
    lastObservedScrollTop = 0;
    lastObservedScrollDirection = 'still';
    scrollOwnership.reset();
    // Cold = no cached content for the new channel at switch time. The window updates
    // synchronously on channel change, so `isEmpty` is already correct here. Warm switches
    // (revisiting a cached channel) stay false → no loading overlay over cached content.
    coldLoadInProgress.value = !!cid && isEmpty.value;
    suppressLoadOlderUntilLeaveTopZone = false;
    prependTransactionActive.value = false;
    olderFetchSkeletonActive.value = false;
    activePrependChannelId.value = null;
    activePrependTxId.value = 0;
    if (cid) {
      pendingInitialScroll.value = true;
      suppressListUntilInitialAnchor.value = true;
      armInitialAnchorOverlaySafety(cid);
    } else {
      pendingInitialScroll.value = false;
      suppressListUntilInitialAnchor.value = false;
      disarmInitialAnchorOverlaySafety();
    }
    jumpUi.reset();
    followNewMessagesToBottom.value = true;
    _voteHandlerCache.clear();
    _reactHandlerCache.clear();
    _pinHandlerCache.clear();
    _unpinHandlerCache.clear();
    rowFactsPrevFirstUnreadMessageId = undefined;
    rowFactsPrevLastReadMessageId = undefined;
    lastEmittedSeenMessageId = undefined;
    emitSeenMessageId(null);
  },
  { immediate: true },
);

watch(
  () =>
    [displayOrderedIds.value.length, displayOrderedIds.value.at(-1)] as const,
  ([len, tailId], prev) => {
    if (prependTransactionActive.value) return;
    if (!prev) return;
    const [prevLen, prevTail] = prev;
    if (len <= prevLen) return;
    if (tailId === prevTail) return;
    if (suppressListUntilInitialAnchor.value) return;
    const lastMsgId = displayOrderedIds.value[len - 1];
    const lastMsg = lastMsgId ? props.messages.get(lastMsgId) : undefined;
    if (
      lastMsg &&
      isEchoMessageLogicallyOwn(
        lastMsg,
        props.currentUserId,
        props.linkedDiscordUserId,
      )
    ) {
      return;
    }
    void nextTick(() => {
      requestAnimationFrame(() => {
        const v = virtualizer.value;
        const totalMsgs = displayOrderedIds.value.length;
        const virtualItems = v?.getVirtualItems() ?? [];
        const lastVisibleIndex =
          virtualItems.length > 0
            ? virtualItems[virtualItems.length - 1]!.index
            : totalMsgs - 1;
        const hiddenFromBottom = Math.max(0, totalMsgs - 1 - lastVisibleIndex);
        if (hiddenFromBottom < BOTTOM_JUMP_SHOW_MESSAGES) return;
        jumpUi.pendingNewWhileAway.value += len - prevLen;
      });
    });
  },
);

watch(suppressListUntilInitialAnchor, (hidden) => {
  if (hidden) return;
  void nextTick(() => {
    updateJumpUiFromScroll();
    if (!deferFullRowHydration.value) {
      rowHydration.scheduleHydrationPass();
    }
  });
});

watch(
  () => virtualizerItems.value.length,
  () => {
    if (deferFullRowHydration.value) return;
    rowHydration.scheduleHydrationPass();
  },
);

watch(
  () => virtualizerItems.value.map((item) => item.index),
  () => {
    hydrateVisibleVirtualRows();
  },
  { flush: 'post' },
);

watch(rowHydration.hydrationEpoch, (epoch, prev) => {
  if (prev === undefined || epoch === prev) return;
  const cid = props.channelId?.trim();
  if (!cid) return;
  const hydratedIds: string[] = [];
  for (const item of virtualizer.value?.getVirtualItems() ?? []) {
    if (isPrependSkeletonVirtualIndex(item.index)) continue;
    const messageId = messageIdForVirtualIndex(item.index);
    if (messageId && rowHydration.isRowHydrated(messageId)) {
      hydratedIds.push(messageId);
    }
  }
  scheduleHydratedRowRemeasure(hydratedIds);
});

watch(
  () => isEmpty.value,
  (empty) => {
    if (!empty) coldLoadInProgress.value = false;
  },
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
      lastObservedScrollTop = el.scrollTop;
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
      if (displayOrderedIds.value.length > 0 && !deferFullRowHydration.value) {
        rowHydration.scheduleHydrationPass();
      }
    }
  });
});

onUnmounted(() => {
  offBeforeChannelChange?.();
  offBeforeChannelChange = null;
  emitSeenMessageId(null);
  persistViewportMemoryForChannel();
  flushMessageListViewportStorage();
  if (scrollJumpRaf != null) {
    cancelAnimationFrame(scrollJumpRaf);
    scrollJumpRaf = null;
  }
  if (scrollIdleRaf != null) {
    cancelAnimationFrame(scrollIdleRaf);
    scrollIdleRaf = null;
  }
  if (viewportMemoryRaf != null) {
    cancelAnimationFrame(viewportMemoryRaf);
    viewportMemoryRaf = null;
  }
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

function getVoteHandler(messageId: string | undefined) {
  if (
    !messageId ||
    isDmCallRollupCollapseMessageId(messageId) ||
    !props.onPollVote
  )
    return undefined;
  let fn = _voteHandlerCache.get(messageId);
  if (!fn) {
    fn = (optId: string) => props.onPollVote!(messageId, optId);
    _voteHandlerCache.set(messageId, fn);
  }
  return fn;
}

function getReactHandler(messageId: string | undefined) {
  if (
    !messageId ||
    isDmCallRollupCollapseMessageId(messageId) ||
    !props.onReact
  )
    return undefined;
  let fn = _reactHandlerCache.get(messageId);
  if (!fn) {
    fn = (emoji: string) => props.onReact!(messageId, emoji);
    _reactHandlerCache.set(messageId, fn);
  }
  return fn;
}

function getPinHandler(messageId: string | undefined) {
  if (!messageId || isDmCallRollupCollapseMessageId(messageId) || !props.onPin)
    return undefined;
  let fn = _pinHandlerCache.get(messageId);
  if (!fn) {
    fn = () => props.onPin!(messageId);
    _pinHandlerCache.set(messageId, fn);
  }
  return fn;
}

function getUnpinHandler(messageId: string | undefined) {
  if (
    !messageId ||
    isDmCallRollupCollapseMessageId(messageId) ||
    !props.onUnpin
  )
    return undefined;
  let fn = _unpinHandlerCache.get(messageId);
  if (!fn) {
    fn = () => props.onUnpin!(messageId);
    _unpinHandlerCache.set(messageId, fn);
  }
  return fn;
}

function revealDmCallRunContainingMessageIfCollapsed(messageId: string): void {
  const cid = props.channelId?.trim();
  if (!cid) return;
  const raw = canonicalOrderedIds.value;
  const entities = messageWindowAuthority.entitiesById.value;
  const ix = raw.indexOf(messageId);
  if (ix < 0) return;
  const ent = entities.get(messageId);
  if (!isDmCallLocalLogEntity(ent)) return;
  let a = ix;
  while (a > 0 && isDmCallLocalLogEntity(entities.get(raw[a - 1]!))) {
    a -= 1;
  }
  let b = ix + 1;
  while (b < raw.length && isDmCallLocalLogEntity(entities.get(raw[b]!))) {
    b += 1;
  }
  const run = raw.slice(a, b);
  if (run.length <= DM_CALL_LOG_HISTORY_VISIBLE_CAP) return;
  const key = dmCallRollupRevealKey(cid, run[0]!);
  if (dmCallRollupRevealKeys.value.has(key)) return;
  const next = new Set(dmCallRollupRevealKeys.value);
  next.add(key);
  dmCallRollupRevealKeys.value = next;
}

function handleExpandDmCallRollFromBubble(messageId: string) {
  const parsed = parseDmCallRollupMessageId(messageId);
  if (!parsed) return;
  const key = dmCallRollupRevealKey(
    parsed.channelId,
    parsed.firstHiddenMessageId,
  );
  if (dmCallRollupRevealKeys.value.has(key)) return;
  const next = new Set(dmCallRollupRevealKeys.value);
  next.add(key);
  dmCallRollupRevealKeys.value = next;
}

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
  rowHydration.forceHydrateMessage(messageId);
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

const MAX_FLASH_HIGHLIGHT_ATTEMPTS = 2;

function flashMessageHighlight(messageId: string): void {
  const tryFlash = (): boolean => {
    const root = containerRef.value;
    if (!root) return false;
    let el: Element | null = null;
    try {
      el = root.querySelector(`#${CSS.escape(`message-${messageId}`)}`);
    } catch {
      el = root.querySelector(
        `[id="message-${String(messageId).replace(/"/g, '')}"]`,
      );
    }
    if (!el) return false;
    el.classList.add('message-highlight');
    setTimeout(() => el.classList.remove('message-highlight'), 2000);
    return true;
  };

  void nextTick(() => {
    let attempt = 0;
    const step = () => {
      attempt++;
      if (attempt > MAX_FLASH_HIGHLIGHT_ATTEMPTS) return;
      if (tryFlash()) return;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function commitVirtualRowMeasure(
  element: Element,
  source: 'ref' | 'resize',
): void {
  if (scrollGestureActive.value && source === 'resize') {
    const deferKey = measureKeyForElement(element);
    if (deferKey) rowResizeMeasureDeferredKeys.add(deferKey);
    return;
  }
  const cid = props.channelId?.trim() ?? '';
  const idxAttr = element.getAttribute('data-index');
  const idx = idxAttr != null ? Number(idxAttr) : NaN;
  const messageIndex = Number.isFinite(idx)
    ? virtualIndexToMessageIndex(idx)
    : -1;
  const messageId =
    messageIndex >= 0 ? (displayOrderedIds.value[messageIndex] ?? null) : null;
  const revisionKey =
    messageIndex >= 0 ? revisionKeyForMessageIndex(messageIndex) : null;
  const deferKey = measureKeyForElement(element);
  const h = element.getBoundingClientRect().height;
  const prev = deferKey ? measureRowLastHeightByKey.get(deferKey) : undefined;
  const heightChanged = prev === undefined || Math.abs(prev - h) >= 0.5;
  if (!heightChanged) {
    return;
  }
  if (messageListDebugEnabled()) {
    const rowVm = Number.isFinite(messageIndex)
      ? (messageListRowPresentations.value[messageIndex] ?? null)
      : null;
    const est =
      Number.isFinite(messageIndex) &&
      messageIndex >= 0 &&
      messageIndex < displayOrderedIds.value.length
        ? estimateMessageRowSizeForMessage(messageIndex)
        : isPrependSkeletonVirtualIndex(idx)
          ? estimateMessageRowSize(idx)
          : null;
    if (est != null && Math.abs(est - h) >= 24) {
      messageListScrollMetricsApi()?.noteEstMismatch();
      logMessageList('measure', 'row_height_est_mismatch', {
        channelId: props.channelId ?? null,
        messageId,
        index: Number.isFinite(idx) ? idx : null,
        measuredPx: Math.round(h),
        estimatePx: Math.round(est),
        deltaPx: Math.round(h - est),
        groupedWithPrevious: rowVm?.layout.groupedWithPrevious ?? null,
        showDaySeparatorBefore: rowVm?.showDaySeparatorBefore ?? null,
        showUnreadSeparatorBefore: rowVm?.showUnreadSeparatorBefore ?? null,
        compactTop: rowVm?.isCompact ?? null,
        source,
      });
    }
  }
  if (deferKey) {
    measureRowLastHeightByKey.set(deferKey, h);
  }
  if (messageId && revisionKey) {
    setMessageRowHeightPx(cid, messageId, h, revisionKey);
  }
  virtualizer.value.measureElement(element);
  messageListScrollMetricsApi()?.noteMeasureEvent();
}

function rowMeasureGeometryForElement(element: Element): {
  rowTopInContainerPx: number | null;
  rowBottomInContainerPx: number | null;
  scrollContainerClientHeightPx: number;
} {
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
}

function scheduleVirtualRowMeasure(
  element: Element,
  source: 'ref' | 'resize',
  options: { force?: boolean } = {},
): void {
  const cid = props.channelId?.trim() ?? '';
  const deferKey = cid ? measureKeyForElement(element) : '';
  if (
    source === 'resize' &&
    scrollExperiments.resizeMeasureDefer &&
    !options.force
  ) {
    const geom = rowMeasureGeometryForElement(element);
    const unresolved = deferKey
      ? (unresolvedResizeDeltaByKey.get(deferKey) ?? 0)
      : 0;
    const slotH = deferKey
      ? (measureRowLastHeightByKey.get(deferKey) ?? null)
      : null;
    const decision = resolveResizeMeasureAction({
      source,
      isUserScrollActive: scrollOwnership.isUserActive(),
      deferFullRowHydration: deferFullRowHydration.value,
      experimentEnabled: scrollExperiments.resizeMeasureDefer,
      prependTransactionActive: prependTransactionActive.value,
      programmaticScrollPending: false,
      rowTopInContainerPx: geom.rowTopInContainerPx,
      rowBottomInContainerPx: geom.rowBottomInContainerPx,
      scrollContainerClientHeightPx: geom.scrollContainerClientHeightPx,
      lastKnownSlotHeightPx: slotH,
      contentHeightPx: element.getBoundingClientRect().height,
      unresolvedDeltaPx: unresolved,
    });
    if (decision.action === 'defer') {
      if (deferKey) rowResizeMeasureDeferredKeys.add(deferKey);
      resizeDeferMetrics.measureDeferredCount++;
      return;
    }
    resizeDeferMetrics.measureNowCount++;
  }

  if (deferKey && measureRowPendingKeys.has(deferKey)) {
    if (messageListDebugEnabled()) {
      logMessageList('measure', 'row_measure_defer_deduped', {
        deferKey,
        source,
      });
    }
    return;
  }
  if (deferKey) {
    measureRowPendingKeys.add(deferKey);
  }
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (deferKey) measureRowPendingKeys.delete(deferKey);
      if (!element.isConnected) return;
      commitVirtualRowMeasure(element, source);
    });
  });
}

function measureRowRefForIndex(
  el: Element | ComponentPublicInstance | null,
  virtualIndex: number,
): void {
  if (!el) {
    detachVirtualRowResizeObservation(virtualIndex);
    return;
  }
  const element = resolveMeasureRowElement(el);
  if (!element) return;
  syncVirtualRowResizeObservation(element, virtualIndex);
  ensureVirtualRowHydrated(virtualIndex);
  if (scrollExperiments.singleMountMeasure) {
    scheduleVirtualRowMeasure(element, 'ref');
  } else {
    commitVirtualRowMeasure(element, 'ref');
    scheduleVirtualRowMeasure(element, 'ref');
  }
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
      <div
        v-if="showNoServersYet"
        class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
        role="status"
        aria-label="No servers yet"
      >
        <div
          class="message-list-empty__icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          aria-hidden="true"
        >
          <img
            :src="icons.explore"
            alt=""
            class="h-8 w-8 opacity-90 filter invert"
          />
        </div>
        <p class="text-base font-semibold text-foreground">
          You're not in any servers yet
        </p>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Explore public communities or join one with an invite to start
          chatting here.
        </p>
        <button
          v-if="onOpenExplore"
          type="button"
          class="chat-focus-ring mt-5 rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-accent/30 transition-colors hover:bg-accent/30"
          @click="onOpenExplore"
        >
          Explore servers
        </button>
      </div>
      <div
        v-else-if="showEmptyChannelHint"
        class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
        role="status"
        aria-label="No messages in this channel"
      >
        <div
          class="message-list-empty__icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          aria-hidden="true"
        >
          <svg
            class="h-7 w-7 text-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>
        <p class="text-base font-semibold text-foreground">
          No messages here yet
        </p>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          When someone sends a message, it will appear here. Say hello to start
          the conversation.
        </p>
      </div>
      <div
        v-else-if="showDiscordImportWidget"
        class="message-list-empty flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 text-center"
      >
        <DiscordChannelImportWidget
          v-if="serverId && channelId"
          :server-id="serverId"
          :channel-id="channelId"
          :channel-name="channelName || ''"
          @imported="emit('imported')"
        />
      </div>
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
            :data-index="virtualRow.index"
            :data-message-id="
              messageIdForVirtualIndex(virtualRow.index) ?? undefined
            "
            :ref="(el) => measureRowRefForIndex(el, virtualRow.index)"
            class="message-list-virtual-row absolute left-0 top-0 flow-root w-full max-w-full"
            :class="{ 'message-list-virtual-row--webkit': safariLikeBrowser }"
            :style="{
              transform: `translate3d(0, ${virtualRow.start}px, 0)`,
            }"
          >
            <div class="w-full max-w-full">
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
.message-list-empty__icon {
  background: var(--overlay-subtle);
}

/*
 * Isolate row layout on Chromium; WebKit can defer repaints on contained,
 * transformed rows during fast scroll and the viewport reads blank briefly.
 */
.message-list-virtual-row {
  contain: layout;
  isolation: isolate;
}

.message-list-virtual-row--webkit {
  contain: none;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
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
