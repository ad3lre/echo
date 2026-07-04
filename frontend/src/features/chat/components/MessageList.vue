<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  computed,
  provide,
  type ComponentPublicInstance,
} from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { MessageWithAuthor, EchoChannelType } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import MessageBubble from './MessageBubble.vue';
import MessageListHistorySkeleton from './MessageListHistorySkeleton.vue';
import { buildHistorySkeletonRowsFromMessages } from './buildHistorySkeletonRowsFromMessages';
import { readMessageSessionCacheForChannel } from '@/utils/messageSessionCache';
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
import DmHistoryIntroCard from './DmHistoryIntroCard.vue';

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
  /** Echo history: load older messages when user scrolls near the top (anchored scroll). */
  loadOlder?: () => Promise<boolean>;
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

const showHistorySkeleton = computed(
  () =>
    isEmpty.value &&
    !!props.initialHistoryLoading &&
    !!props.channelId &&
    isEchoGraphId(props.channelId),
);
const showTransitionSkeleton = computed(
  () =>
    isEmpty.value &&
    !showHistorySkeleton.value &&
    (!!props.transitionLoading ||
      (!props.hasChannel && !!props.guildShellSettling)),
);

const showLoadingSkeleton = computed(
  () => showHistorySkeleton.value || showTransitionSkeleton.value,
);

const historySkeletonRows = computed(() => {
  if (!showLoadingSkeleton.value) return undefined;
  const cid = props.channelId?.trim();
  const userId = props.currentUserId?.trim();
  if (!cid || !userId) return undefined;
  const cached = readMessageSessionCacheForChannel(userId, cid);
  if (!cached?.messages.length) return undefined;
  return buildHistorySkeletonRowsFromMessages(cached.messages, (authorId) => {
    for (const msg of cached.messages) {
      if (msg.authorId === authorId && msg.authorDisplayName?.trim()) {
        return msg.authorDisplayName.trim();
      }
    }
    for (const msg of props.messages.values()) {
      if (msg.authorId === authorId) {
        const name =
          (msg as MessageWithAuthor & { authorName?: string }).authorName ??
          msg.author?.name;
        if (name?.trim()) return name.trim();
      }
    }
    return 'Member';
  });
});

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

  const historySkeletonSample: SkeletonSample = {
    startedAtMs: 0,
    channelId: null,
  };
  const transitionSkeletonSample: SkeletonSample = {
    startedAtMs: 0,
    channelId: null,
  };

  function debugNowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function beginSkeletonSample(
    kind: 'history' | 'transition',
    sample: SkeletonSample,
  ): void {
    if (sample.startedAtMs > 0) return;
    sample.startedAtMs = debugNowMs();
    sample.channelId = props.channelId?.trim() || null;
    logMessageList('history', `${kind}_skeleton_visible_start`, {
      kind,
      channelId: sample.channelId,
      transitionLoading: !!props.transitionLoading,
      initialHistoryLoading: !!props.initialHistoryLoading,
      outcomeOk: true,
      expectation:
        'visible skeleton timer starts when empty-state loading placeholder appears',
    });
  }

  function finishSkeletonSample(
    kind: 'history' | 'transition',
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
      event:
        kind === 'history'
          ? 'message_list_history_skeleton_visible'
          : 'message_list_transition_skeleton_visible',
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
    logMessageList('history', `${kind}_skeleton_visible_end`, {
      kind,
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
      finishSkeletonSample('history', historySkeletonSample, 'channel_change');
      finishSkeletonSample(
        'transition',
        transitionSkeletonSample,
        'channel_change',
      );
    },
  );

  watch(showHistorySkeleton, (visible) => {
    if (visible) {
      beginSkeletonSample('history', historySkeletonSample);
      return;
    }
    finishSkeletonSample('history', historySkeletonSample, 'hidden');
  });

  watch(showTransitionSkeleton, (visible) => {
    if (visible) {
      beginSkeletonSample('transition', transitionSkeletonSample);
      return;
    }
    finishSkeletonSample('transition', transitionSkeletonSample, 'hidden');
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
      showHistorySkeleton: showHistorySkeleton.value,
      showTransitionSkeleton: showTransitionSkeleton.value,
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
/**
 * Hysteresis for “following” the latest messages: if the user scrolls up farther than
 * this from the bottom, new incoming messages will not auto-scroll until they return near
 * the bottom or use jump-to-latest.
 */
const FOLLOW_NEW_DETACH_PX = 280;
/** When the viewport comes back within this distance of the bottom, resume auto-follow. */
const FOLLOW_NEW_ATTACH_PX = 80;
const NEAR_TOP_PX = 120;
/** Show jump-to-latest only after user moved away by this many messages. */
const BOTTOM_JUMP_SHOW_MESSAGES = 30;
/**
 * Extra rows TanStack Virtual keeps mounted above/below the viewport (not pixels).
 * Deliberately high: retain more DOM, fewer mount/unmount cycles and measurement races.
 * Trade memory for scroll stability — do not tune this like a mobile list from 2012.
 */
const MESSAGE_LIST_OVERSCAN = 100;
/** Fewer off-screen rows on touch devices (GPU / layout budget on WebKit mobile). */
const MESSAGE_LIST_OVERSCAN_COARSE = 56;
/**
 * Space above each row for `MessageActionBar` (`absolute -top-3`) so hover actions
 * are not clipped by the scroll container's overflow. Must stay in sync with
 * `virtualizerScrollPaddingStart` when messages are present.
 */
const MESSAGE_LIST_ACTION_BAR_GUTTER_PX = 14;
const USER_SCROLL_SETTLE_MS = 180;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Single arbiter for every programmatic scroll write in this component.
 * See `messageListScrollOwnership.ts` for the model. All scroll writes route
 * through {@link commitScrollToLatest} / {@link scrollOwnership.canCommit}; this is the
 * only thing that decides whether the system may move the viewport.
 */
const scrollOwnership = createMessageListScrollOwnership({
  now: nowMs,
  userScrollSettleMs: USER_SCROLL_SETTLE_MS,
});

/**
 * Run a programmatic scroll write while bracketing it so the resulting native
 * `scroll` events are recognized as ours (never misread as a user gesture).
 */
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
const prependTransactionActive = ref(false);
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

function estimateMessageRowSize(index: number): number {
  const msgId = displayOrderedIds.value[index];
  const message = msgId ? mergedMessagesForList.value.get(msgId) : undefined;
  if (!message) return MESSAGE_LIST_DEFAULT_ROW_ESTIMATE_PX;

  const rowVm = messageListRowPresentations.value[index];
  const groupedWithPrevious = rowVm?.layout.groupedWithPrevious ?? false;
  const showDaySeparatorBefore =
    rowVm?.showDaySeparatorBefore ??
    shouldShowDaySeparatorBefore(
      displayOrderedIds.value,
      mergedMessagesForList.value,
      index,
    );

  return estimateMessageListRowSizePx({
    groupedWithPrevious,
    showDaySeparatorBefore,
    message,
  });
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
  const n = displayOrderedIds.value.length;
  let sum = virtualizerScrollPaddingStart.value + 16;
  for (let i = 0; i < n; i++) {
    sum += estimateMessageRowSize(i);
  }
  return sum;
}

/** Virtual list: display ids (may include DM call-log rollup row); row identity = message id (viewport contract). */
const virtualizerOptions = computed(() => ({
  count: displayOrderedIds.value.length,
  getScrollElement: () => containerRef.value,
  estimateSize: estimateMessageRowSize,
  overscan: coarsePointer.value
    ? MESSAGE_LIST_OVERSCAN_COARSE
    : MESSAGE_LIST_OVERSCAN,
  scrollPaddingStart: virtualizerScrollPaddingStart.value,
  scrollPaddingEnd: 16,
  /** TanStack row identity: message id string only — no index, no composite, no revision churn. */
  getItemKey: (index: number) => displayOrderedIds.value[index] ?? '',
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
    if (cid) {
      const saved = readMessageListViewport(cid);
      if (saved) {
        const anchorIndex = displayOrderedIds.value.indexOf(
          saved.anchorMessageId,
        );
        if (anchorIndex >= 0) {
          let offset = 0;
          for (let i = 0; i < anchorIndex; i++) {
            offset += estimateMessageRowSize(i);
          }
          return Math.max(0, offset - saved.anchorTop);
        }
      }
    }
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
    _delta: number,
    instance: { scrollOffset: number | null },
  ) =>
    item.start < (instance.scrollOffset ?? 0) ||
    (followNewMessagesToBottom.value && !scrollOwnership.isUserActive()),
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
    virtualItems.length === 0
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
    return false;
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
}

/**
 * Scroll listener: cheap state only (position, direction, user-scroll window).
 * Does not interpret message semantics or history membership — see viewport contract.
 * Heavy follow-up is coalesced via {@link scheduleScrollIdleWork}.
 */
function onScrollCombined() {
  const el = containerRef.value;
  const nextScrollTop = el?.scrollTop ?? 0;
  lastObservedScrollDirection = getScrollDirection(
    lastObservedScrollTop,
    nextScrollTop,
  );
  lastObservedScrollTop = nextScrollTop;
  if (prependTransactionActive.value) return;
  // Distinguish our own programmatic scrolls from user-driven ones (e.g. scrollbar
  // drag); only the latter refreshes the user-active window.
  scrollOwnership.noteScrollEvent();
  scheduleScrollIdleWork();
}

/**
 * Genuine user input gestures (wheel, touch, navigation keys) unambiguously mean
 * the user is driving — claim scroll ownership even during initial load so the
 * one-shot anchor / viewport restore yields instead of yanking them back.
 */
function onUserScrollGesture() {
  if (prependTransactionActive.value) return;
  scrollOwnership.markUserGesture();
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
async function loadOlderWithTransaction() {
  const el = containerRef.value;
  const fn = props.loadOlder;
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
  if (props.loadingOlder) {
    logMessageListThrottled(
      'prepend_skip_props_loading',
      400,
      'prepend',
      'loadOlder_skipped',
      { reason: 'props_loadingOlder' },
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
  let restoreRan = false;
  let lastAnchorRestoreOk = false;
  try {
    const added = await fn();
    if (!added || !isPrependTransactionCurrent(channelId, txId)) {
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

if (import.meta.env.DEV) {
  watch(
    () => ({
      channelId: props.channelId ?? null,
      count: displayOrderedIds.value.length,
      overscan: coarsePointer.value
        ? MESSAGE_LIST_OVERSCAN_COARSE
        : MESSAGE_LIST_OVERSCAN,
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

/**
 * The loading skeleton is held over the list until the initial position settles — but ONLY for a
 * cold open. For a cold channel this makes the initial position (latest, or a remembered spot
 * restored across frames) **load state, not a visible scroll**: positioning finishes behind the
 * overlay, then it cross-fades to reveal messages in place.
 *
 * For a WARM switch (revisiting a cached channel) `coldLoadInProgress` stays false, so the cached
 * content swaps in instantly — no skeleton over content, no "second of nothing". The remembered
 * position comes from the virtualizer's `initialOffset` on first paint, which is already correct
 * because the anchor message is in the cached window.
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
          if (anchor === 'bottom') {
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
    lastObservedScrollTop = 0;
    lastObservedScrollDirection = 'still';
    scrollOwnership.reset();
    // Cold = no cached content for the new channel at switch time. The window updates
    // synchronously on channel change, so `isEmpty` is already correct here. Warm switches
    // (revisiting a cached channel) stay false → no loading overlay over cached content.
    coldLoadInProgress.value = !!cid && isEmpty.value;
    suppressLoadOlderUntilLeaveTopZone = false;
    prependTransactionActive.value = false;
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
  void nextTick(() => updateJumpUiFromScroll());
});

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
  if (messageListDebugEnabled()) {
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

function measureRowRef(el: Element | ComponentPublicInstance | null) {
  const node =
    el && typeof el === 'object' && '$el' in el
      ? (el as ComponentPublicInstance).$el
      : el;
  const element = node as Element | null;
  if (!element) return;
  const cid = props.channelId?.trim() ?? '';
  const idxAttr = element.getAttribute('data-index');
  const deferKey = cid && idxAttr != null ? `${cid}:${idxAttr}` : '';
  if (deferKey && measureRowPendingKeys.has(deferKey)) {
    if (messageListDebugEnabled()) {
      logMessageList('measure', 'row_measure_defer_deduped', { deferKey });
    }
    return;
  }
  if (deferKey) {
    measureRowPendingKeys.add(deferKey);
  }
  // TanStack Virtual calls onChange → triggerRef synchronously from resizeItem. Invoking
  // measureElement during the same render/patch flush as :ref recreates a Vue "recursive
  // updates" loop (often surfaced on <AppLayout>). Defer past the patch flush, then rAF.
  // If AppLayout recursive-update warnings return, revert to a single rAF here.
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (deferKey) measureRowPendingKeys.delete(deferKey);
      if (!element.isConnected) return;
      if (deferKey) {
        const h = element.getBoundingClientRect().height;
        const prev = measureRowLastHeightByKey.get(deferKey);
        if (prev !== undefined && Math.abs(prev - h) < 0.5) {
          return;
        }
        const idxAttr = element.getAttribute('data-index');
        const idx = idxAttr != null ? Number(idxAttr) : NaN;
        if (messageListDebugEnabled()) {
          const rowVm = Number.isFinite(idx)
            ? (messageListRowPresentations.value[idx] ?? null)
            : null;
          const est =
            Number.isFinite(idx) &&
            idx >= 0 &&
            idx < displayOrderedIds.value.length
              ? estimateMessageRowSize(idx)
              : null;
          if (est != null && Math.abs(est - h) >= 24) {
            const msgId = Number.isFinite(idx)
              ? (displayOrderedIds.value[idx] ?? null)
              : null;
            logMessageList('measure', 'row_height_est_mismatch', {
              channelId: props.channelId ?? null,
              messageId: msgId,
              index: Number.isFinite(idx) ? idx : null,
              measuredPx: Math.round(h),
              estimatePx: Math.round(est),
              deltaPx: Math.round(h - est),
              groupedWithPrevious: rowVm?.layout.groupedWithPrevious ?? null,
              showDaySeparatorBefore: rowVm?.showDaySeparatorBefore ?? null,
              showUnreadSeparatorBefore:
                rowVm?.showUnreadSeparatorBefore ?? null,
              compactTop: rowVm?.isCompact ?? null,
            });
          }
        }
        measureRowLastHeightByKey.set(deferKey, h);
      }
      virtualizer.value.measureElement(element);
    });
  });
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
        <div
          v-if="loadingOlder"
          class="message-list-older-loader sticky top-0 z-10 flex w-full justify-center py-2"
          role="status"
          aria-live="polite"
          aria-label="Loading older messages"
        >
          <svg
            class="echo-ios-spinner"
            viewBox="0 0 44 44"
            width="28"
            height="28"
            aria-hidden="true"
          >
            <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
            <circle
              class="echo-ios-spinner__arc"
              cx="22"
              cy="22"
              r="18"
              transform="rotate(-90 22 22)"
            />
          </svg>
        </div>
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
            :key="displayOrderedIds[virtualRow.index] ?? ''"
            :data-index="virtualRow.index"
            :ref="measureRowRef"
            class="absolute left-0 top-0 w-full max-w-full [contain:layout]"
            :style="{ transform: `translateY(${virtualRow.start}px)` }"
          >
            <div class="w-full max-w-full">
              <MessageBubble
                :row="messageListRowPresentations[virtualRow.index]!"
                :channel-id="channelId"
                :is-forum-post-channel="isForumPostChannel"
                :server-id="serverId"
                :resolve-author-role="resolveAuthorRole"
                :current-user-id="currentUserId"
                :linked-discord-user-id="linkedDiscordUserId"
                :current-user-name="currentUserName"
                :resolve-poll-voter-display="resolvePollVoterDisplay"
                :resolve-poll-voter-avatar="resolvePollVoterAvatar"
                :on-vote="getVoteHandler(displayOrderedIds[virtualRow.index])"
                :on-react="getReactHandler(displayOrderedIds[virtualRow.index])"
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
                  displayOrderedIds[virtualRow.index]
                    ? pinnedIdSet.has(displayOrderedIds[virtualRow.index])
                    : false
                "
                :on-pin="getPinHandler(displayOrderedIds[virtualRow.index])"
                :on-unpin="getUnpinHandler(displayOrderedIds[virtualRow.index])"
                :can-moderate-author="canModerateAuthor"
                @moderate-user="onModerateUser?.($event)"
                :on-request-forward="onRequestForward"
              />
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
        <MessageListHistorySkeleton
          :rows="historySkeletonRows"
          :aria-label="
            showHistorySkeleton ? 'Loading messages' : 'Loading conversation'
          "
        />
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
 * The overlay must OCCLUDE the real list mounted underneath while the one-shot
 * bottom-anchor settles (see showInitialLoadOverlay / suppressListUntilInitialAnchor) —
 * the design comment says positioning happens "behind the overlay". Without an opaque
 * fill the half-painted content (loading avatars, image-slot shimmers) bled through as a
 * washed panel offset by the avatar gutter. Paint the same bg as ChatView so the skeleton
 * sits on the exact chat background, then cross-fade out to reveal messages in place.
 */
.message-list-skeleton-overlay {
  background: var(--echo-chat-view-bg);
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
