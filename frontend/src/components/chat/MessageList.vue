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
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import MessageBubble from './MessageBubble.vue';
import MessageListJumpFab from './MessageListJumpFab.vue';
import {
  createMessageListJumpUi,
  MESSAGE_LIST_JUMP_UI_KEY,
} from '@/features/chat/viewModel/messageListJumpUi';
import type { MemberRole, PopoutAnchorRect } from '@/utils/memberProfiles';
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
  ANCHOR_DRIFT_THRESHOLD_PX,
  getAnchorMessageIdFromViewport,
  getScrollDirection,
  measureMessageTopInContainer,
  restorePrependScroll,
  type PrependSnapshot,
} from '@/features/chat/domain/messageListPrependAnchor';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
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
  onSaveEdit?: (
    messageId: string,
    newContent: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
  ) => boolean | void | Promise<boolean | void>;
  onDelete?: (messageId: string) => void;
  onReply?: (message: MessageWithAuthor) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onGoToChannel?: (channelId: string) => void;
  onGoToMessage?: (channelId: string, messageId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
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
  loadingOlder?: boolean;
  /** Echo: while first page of history loads for an empty UUID channel, show message-shaped skeletons. */
  initialHistoryLoading?: boolean;
  /** Navigation-level loading (e.g. DM thread opening) before channel id/history resolve. */
  transitionLoading?: boolean;
  /** Servers rail with no joinable guild / channel chrome (empty onboarding) — show CTA instead of generic empty channel copy. */
  noServersYet?: boolean;
  onOpenExplore?: () => void;
  isDiscordImportedServer?: boolean;
  discordChannelId?: string;
  channelName?: string;
  /** When `voice`, Discord message import is not offered (voice side chat / voice channels). */
  channelType?: 'text' | 'voice' | 'forum';
  /** True when viewing a forum post channel (child thread channel under a forum). */
  isForumPostChannel?: boolean;
  /** Server owner / manage-server only — empty-channel Discord import CTA. */
  canShowDiscordChannelImport?: boolean;
  /**
   * After initial history: scroll to bottom (latest) or top of loaded window.
   * Main chat always passes `bottom`. Use `top` only for explicit integrations (e.g. forced window modes), not normal channel open.
   */
  messageScrollAnchor?: 'top' | 'bottom';
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
    statusNugget?: string;
    mutualCommunitiesCount?: number;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void | Promise<void>;
    /** Short line below the subtitle (e.g. nudge to use the composer). */
    helloNudge?: string;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'imported'): void;
  (e: 'seen-message-id-changed', messageId: string | null): void;
}>();

type ChannelViewportMemoryEntry = {
  anchorMessageId: string;
  anchorTop: number;
  savedAtMs: number;
};

/**
 * Temporary per-channel viewport memory for this client session only.
 * This is UI state, not domain truth.
 */
const channelViewportMemory = new Map<string, ChannelViewportMemoryEntry>();

/** Isolated from list row render: scroll handlers mutate; only MessageListJumpFab reads. */
const jumpUi = createMessageListJumpUi();
provide(MESSAGE_LIST_JUMP_UI_KEY, jumpUi);

const coarsePointer = useCoarsePointer();

const messageScrollAnchorResolved = computed(
  () => props.messageScrollAnchor ?? 'bottom',
);

async function forwardSaveEdit(
  messageId: string,
  newContent: string,
  attachments?: import('@shared/types').MessageAttachmentPayload[],
): Promise<boolean> {
  const fn = props.onSaveEdit;
  if (!fn) return true;
  const r = await Promise.resolve(fn(messageId, newContent, attachments));
  return r !== false;
}

function forwardBubbleDelete(messageId: string) {
  props.onDelete?.(messageId);
}

function forwardBubbleReply(message: MessageWithAuthor) {
  props.onReply?.(message);
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

/** When the last message’s reactions change (no new row), re-measure can push the tail past the fold — snap if the user was following the end. */
const TAIL_REACTIONS_SEP = '\u001f';
const tailMessageReactionsSignature = computed(() => {
  const ids = displayOrderedIds.value;
  if (ids.length === 0) return '';
  const tailId = ids[ids.length - 1]!;
  const msg =
    props.messages.get(tailId) ?? mergedMessagesForList.value.get(tailId);
  const parts = msg?.reactions?.map((r) => `${r.emoji}:${r.count}`) ?? [];
  return `${tailId}${TAIL_REACTIONS_SEP}${parts.join('\u0001')}`;
});

type MessageBubbleApi = {
  enterEditMode?: () => void;
};
const bubbleApiByMessageId = new Map<string, MessageBubbleApi>();
type MessageBubbleRefBinder = (
  el: Element | ComponentPublicInstance | null,
) => void;
const messageBubbleRefBinderByMessageId = new Map<
  string,
  MessageBubbleRefBinder
>();

function bindMessageBubbleRef(
  messageId: string | undefined,
  el: Element | ComponentPublicInstance | null,
) {
  const id = messageId?.trim();
  if (!id) return;
  if (!el) {
    bubbleApiByMessageId.delete(id);
    return;
  }
  bubbleApiByMessageId.set(id, el as unknown as MessageBubbleApi);
}

function getMessageBubbleRef(
  messageId: string | undefined,
): MessageBubbleRefBinder | undefined {
  const id = messageId?.trim();
  if (!id) return undefined;
  let fn = messageBubbleRefBinderByMessageId.get(id);
  if (!fn) {
    fn = (el) => {
      bindMessageBubbleRef(id, el);
    };
    messageBubbleRefBinderByMessageId.set(id, fn);
  }
  return fn;
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
    isEmpty.value && !!props.transitionLoading && !showHistorySkeleton.value,
);

const showNoServersYet = computed(
  () =>
    !!props.noServersYet &&
    isEmpty.value &&
    !showHistorySkeleton.value &&
    !showTransitionSkeleton.value,
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
    !showHistorySkeleton.value &&
    !showNoServersYet.value &&
    !discordMessageImportEligible.value &&
    !props.dmHistoryIntro,
);

const showDiscordImportWidget = computed(
  () =>
    isEmpty.value &&
    !showHistorySkeleton.value &&
    !showNoServersYet.value &&
    discordMessageImportEligible.value,
);

const showDmHistoryIntro = computed(
  () =>
    isEmpty.value &&
    !!props.dmHistoryIntro &&
    !showHistorySkeleton.value &&
    !showTransitionSkeleton.value &&
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
 * `52px` (`3.25rem`) keeps a thin gap under the glass header; `compactTop` skips this for voice side chat.
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
  const base = props.compactTop ? 12 : props.hasChannel ? 52 : 16;
  return base + gutter;
});

const scrollContainerPaddingBottomClass = computed(() => {
  if (!isEmpty.value || showHistorySkeleton.value) return '';
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
const MESSAGE_LIST_OVERSCAN = 120;
/** Fewer off-screen rows on touch devices (GPU / layout budget on WebKit mobile). */
const MESSAGE_LIST_OVERSCAN_COARSE = 56;
/**
 * Space above each row for `MessageActionBar` (`absolute -top-3`) so hover actions
 * are not clipped by the scroll container's overflow. Must stay in sync with
 * `virtualizerScrollPaddingStart` when messages are present.
 */
const MESSAGE_LIST_ACTION_BAR_GUTTER_PX = 14;
const MESSAGE_LIST_DEFAULT_ESTIMATE = 88;
const USER_SCROLL_SETTLE_MS = 180;

/** Whether new messages should pull the viewport to the latest (bottom-anchored channels). */
const followNewMessagesToBottom = ref(true);

let scrollJumpRaf: number | null = null;
/** Coalesces load-older + jump UI to one rAF — never run that work on the scroll event itself. */
let scrollIdleRaf: number | null = null;
let viewportMemoryRaf: number | null = null;
let userScrollActiveUntilMs = 0;
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
    // Fall back to current anchor mode so "visible on open" can still advance read state.
    return messageScrollAnchorResolved.value === 'top'
      ? (displayOrderedIds.value[0] ?? null)
      : (displayOrderedIds.value[displayOrderedIds.value.length - 1] ?? null);
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
  if (!message) return MESSAGE_LIST_DEFAULT_ESTIMATE;

  const rowVm = messageListRowPresentations.value[index];
  const grouped = rowVm?.layout.groupedWithPrevious ?? false;
  const daySep =
    rowVm?.showDaySeparatorBefore ??
    shouldShowDaySeparatorBefore(
      displayOrderedIds.value,
      mergedMessagesForList.value,
      index,
    );

  let size = grouped ? 56 : 78;
  if (daySep) size += 32;
  const body = message.contentText ?? message.content ?? '';
  const lineCount = Math.max(1, body.split('\n').length);
  size += Math.min(5, lineCount) * 18;
  size += Math.min(120, Math.ceil(body.length / 90) * 18);

  if (message.replyTo) size += 28;
  if (message.forwardedFrom) size += 24;
  if (message.poll) {
    size += 128 + Math.min(120, (message.poll.options?.length ?? 0) * 24);
  }

  const attachments = message.attachments ?? [];
  if (
    message.videoUrl ||
    attachments.some((attachment) => attachment.kind === 'video')
  ) {
    size += 280;
  } else if (
    attachments.some((attachment) => attachment.kind === 'document')
  ) {
    size += 120;
  } else if (
    message.imageUrl ||
    message.gif ||
    (message.stickers?.length ?? 0) > 0 ||
    attachments.some(
      (attachment) => attachment.kind === 'image' || attachment.kind === 'gif',
    )
  ) {
    size += 240;
  }

  const embeds = message.embeds ?? [];
  if (embeds.some((embed) => embed.video != null)) {
    size += 240;
  } else if (embeds.some((embed) => !!embed.image?.url?.trim())) {
    size += 180;
  } else if (embeds.length > 0) {
    size += 96;
  }

  if ((message.reactions?.length ?? 0) > 0) {
    size += 36;
  }

  return Math.max(64, Math.min(520, size));
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
    if (messageScrollAnchorResolved.value !== 'bottom') return 0;
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
   * GIF/media decode changes row height after mount. TanStack Virtual's default scroll
   * compensation while `scrollDirection` is null (not user-scrolling) can fight
   * pinned-to-newest and visibly yank the list up/down repeatedly.
   */
  shouldAdjustScrollPositionOnItemSizeChange: (
    _item: unknown,
    _delta: number,
    instance: {
      scrollDirection: 'forward' | 'backward' | null;
      getTotalSize: () => number;
    },
  ) => {
    if (prependTransactionActive.value) return false;
    if (instance.scrollDirection !== null) return true;
    const el = containerRef.value;
    if (!el || displayOrderedIds.value.length === 0) return true;
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < userScrollActiveUntilMs) return false;
    if (messageScrollAnchorResolved.value === 'top') {
      return el.scrollTop > NEAR_TOP_PX;
    }
    const total = instance.getTotalSize();
    const dist = total - el.scrollTop - el.clientHeight;
    return dist > NEAR_BOTTOM_PX + 120;
  },
}));

function distanceFromBottomPx(): number {
  const el = containerRef.value;
  const v = virtualizer.value;
  if (!el || !v) return 0;
  return Math.max(0, v.getTotalSize() - el.scrollTop - el.clientHeight);
}

function clampScrollTop(container: HTMLElement, scrollTop: number): number {
  return Math.max(
    0,
    Math.min(scrollTop, container.scrollHeight - container.clientHeight),
  );
}

function hasChannelViewportMemory(
  channelId: string | null | undefined,
): boolean {
  const cid = channelId?.trim();
  return !!cid && channelViewportMemory.has(cid);
}

function persistViewportMemoryForChannel(
  channelId: string | null | undefined = props.channelId,
): void {
  const cid = channelId?.trim();
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

  channelViewportMemory.set(cid, {
    anchorMessageId: anchor.anchorMessageId,
    anchorTop,
    savedAtMs:
      typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_saved', {
      channelId: cid,
      anchorMessageId: anchor.anchorMessageId,
      anchorTop,
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

function restoreViewportMemoryForChannel(channelId: string): boolean {
  const entry = channelViewportMemory.get(channelId);
  const el = containerRef.value;
  if (!entry || !el || displayOrderedIds.value.length === 0) return false;
  if (!displayOrderedIds.value.includes(entry.anchorMessageId)) {
    channelViewportMemory.delete(channelId);
    return false;
  }

  const anchorTopAfter = measureMessageTopInContainer(
    el,
    entry.anchorMessageId,
  );
  if (anchorTopAfter == null) return false;
  const delta = anchorTopAfter - entry.anchorTop;
  el.scrollTop = clampScrollTop(el, el.scrollTop + delta);
  persistViewportMemoryForChannel(channelId);

  if (messageListDebugEnabled()) {
    logMessageList('viewport_memory', 'viewport_memory_restored', {
      channelId,
      anchorMessageId: entry.anchorMessageId,
      anchorTopBefore: entry.anchorTop,
      anchorTopAfter,
      deltaApplied: delta,
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
  if (messageScrollAnchorResolved.value === 'bottom') {
    if (d > FOLLOW_NEW_DETACH_PX) followNewMessagesToBottom.value = false;
    else if (d < FOLLOW_NEW_ATTACH_PX) followNewMessagesToBottom.value = true;
  }
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
  if (messageScrollAnchorResolved.value === 'bottom') {
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
  }
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
  userScrollActiveUntilMs =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) +
    USER_SCROLL_SETTLE_MS;
  scheduleScrollIdleWork();
}

function jumpToLatestMessages() {
  followNewMessagesToBottom.value = true;
  jumpUi.pendingNewWhileAway.value = 0;
  scrollToBottom(true);
  requestAnimationFrame(() => {
    scheduleJumpUiFromScroll();
  });
}

const containerRef = ref<HTMLElement | null>(null);

/** Max scrollTop for the list container (actual DOM; aligns with virtualizer total height). */
function snapContainerScrollToBottom() {
  const el = containerRef.value;
  if (!el) return;
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
}

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
  suppressLoadOlderUntilLeaveTopZone = true;
  logMessageList('prepend', 'prepend_tx_finalized', {
    channelId,
    txId,
    expectation:
      'prepend flag cleared; load-older suppressed until user leaves top zone',
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
    if (performance.mark)
      performance.mark(`messagelist-prepend-nexttick-${txId}`);
    restoreRan = true;
    const restore = restorePrependScroll(el, snapshot);
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
    if (el.scrollTop > NEAR_TOP_PX) {
      suppressLoadOlderUntilLeaveTopZone = false;
      logMessageList('scroll', 'suppress_top_zone_cleared', {
        scrollTop: el.scrollTop,
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
  if (lastObservedScrollDirection !== 'up') {
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

const virtualizer = useVirtualizer(virtualizerOptions);

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
function scrollToBottom(smooth = false) {
  nextTick(() => {
    requestAnimationFrame(() => {
      const v = virtualizer.value;
      if (!v || displayOrderedIds.value.length === 0) return;
      v.scrollToIndex(displayOrderedIds.value.length - 1, {
        align: 'end',
        behavior: smooth ? 'smooth' : 'auto',
      });
      if (!smooth) {
        snapContainerScrollToBottom();
        requestAnimationFrame(() => {
          snapContainerScrollToBottom();
        });
      } else {
        /** After smooth scroll, align to true `scrollHeight` (virtual row measure can lag). */
        window.setTimeout(() => {
          snapContainerScrollToBottom();
        }, 400);
      }
    });
  });
}

/** Internal guard while the first bottom-anchor settles; do not turn this into a visual blocker. */
const suppressListUntilInitialAnchor = ref(false);

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
    scrollAnchor: messageScrollAnchorResolved.value,
    expectation: 'one rAF commit: scroll to top or bottom of loaded window',
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
        anchor: 'top' | 'bottom' | 'restored_memory' | 'skipped_empty',
      ) => {
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
      if (channelId && restoreViewportMemoryForChannel(channelId)) {
        finish('restored_memory');
        return;
      }
      if (messageScrollAnchorResolved.value === 'top') {
        v.scrollToIndex(0, { align: 'start', behavior: 'auto' });
        persistViewportMemoryForChannel(channelId);
        finish('top');
        return;
      }

      const lastIdx = displayOrderedIds.value.length - 1;
      v.scrollToIndex(lastIdx, { align: 'end', behavior: 'auto' });
      snapContainerScrollToBottom();
      persistViewportMemoryForChannel(channelId);
      finish('bottom');
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
  (cid, prevCid) => {
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
    messageBubbleRefBinderByMessageId.clear();
    lastObservedScrollTop = 0;
    lastObservedScrollDirection = 'still';
    suppressLoadOlderUntilLeaveTopZone = false;
    prependTransactionActive.value = false;
    activePrependChannelId.value = null;
    activePrependTxId.value = 0;
    if (cid) {
      pendingInitialScroll.value = true;
      if (
        messageScrollAnchorResolved.value === 'bottom' ||
        hasChannelViewportMemory(cid)
      ) {
        suppressListUntilInitialAnchor.value = true;
      } else {
        suppressListUntilInitialAnchor.value = false;
      }
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
    if (messageScrollAnchorResolved.value !== 'bottom') return;
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
    pendingInitialScroll.value = false;
    applyInitialScrollAnchor();
  },
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
    },
  );
  nextTick(() => {
    const el = containerRef.value;
    if (el) {
      lastObservedScrollTop = el.scrollTop;
      el.addEventListener('scroll', onScrollCombined, { passive: true });
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

    nextTick(() => {
      requestAnimationFrame(() => {
        const el = containerRef.value;
        const v = virtualizer.value;
        if (!el || !v) return;
        const total = v.getTotalSize();
        const distanceFromBottom = total - el.scrollTop - el.clientHeight;
        /** Same band as follow-detach (`updateJumpUiFromScroll`) — “near end” for send / incoming. */
        const near = distanceFromBottom < FOLLOW_NEW_DETACH_PX;
        const shouldFollow =
          sentByCurrentUser || followNewMessagesToBottom.value || near;
        if (!shouldFollow) return;
        /**
         * Always use instant scroll here + DOM snap. Smooth `scrollToIndex` skipped
         * `snapContainerScrollToBottom`, so the viewport often stopped short of the true
         * bottom after a new row measured (virtualizer total height updates one frame late).
         */
        v.scrollToIndex(len - 1, {
          align: 'end',
          behavior: 'auto',
        });
        snapContainerScrollToBottom();
        requestAnimationFrame(() => {
          snapContainerScrollToBottom();
        });
        followNewMessagesToBottom.value = true;
        emitSeenMessageId(resolveSeenMessageId());
      });
    });
  },
);

watch(tailMessageReactionsSignature, (sig, prev) => {
  if (!sig || prev === undefined) return;
  const i = sig.indexOf(TAIL_REACTIONS_SEP);
  const pi = prev.indexOf(TAIL_REACTIONS_SEP);
  const tailId = i < 0 ? sig : sig.slice(0, i);
  const prevTailId = pi < 0 ? prev : prev.slice(0, pi);
  if (tailId !== prevTailId) return;
  if (sig === prev) return;
  if (prependTransactionActive.value) return;
  if (suppressListUntilInitialAnchor.value) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = containerRef.value;
      const v = virtualizer.value;
      if (!el || !v) return;
      const len = displayOrderedIds.value.length;
      if (len === 0) return;
      const total = v.getTotalSize();
      const distanceFromBottom = total - el.scrollTop - el.clientHeight;
      const near = distanceFromBottom < FOLLOW_NEW_DETACH_PX;
      if (!near && !followNewMessagesToBottom.value) return;
      v.scrollToIndex(len - 1, {
        align: 'end',
        behavior: 'auto',
      });
      snapContainerScrollToBottom();
      requestAnimationFrame(() => {
        snapContainerScrollToBottom();
      });
      followNewMessagesToBottom.value = true;
      emitSeenMessageId(resolveSeenMessageId());
    });
  });
});

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
      virtualizer.value.scrollToIndex(idx, {
        align: 'center',
        behavior: 'smooth',
      });
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
        measureRowLastHeightByKey.set(deferKey, h);
      }
      virtualizer.value.measureElement(element);
    });
  });
}

async function enterEditModeForMessageId(messageId: string): Promise<boolean> {
  const id = messageId.trim();
  if (!id) return false;
  await scrollMessageIntoView(id);
  await nextTick();
  return await new Promise<boolean>((resolve) => {
    let attempts = 0;
    const step = () => {
      attempts += 1;
      const api = bubbleApiByMessageId.get(id);
      if (api?.enterEditMode) {
        api.enterEditMode();
        resolve(true);
        return;
      }
      if (attempts >= 12) {
        resolve(false);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

defineExpose({
  scrollMessageIntoView,
  flashMessageHighlight,
  scrollToBottom,
  isNearBottom,
  enterEditModeForMessageId,
});
</script>

<template>
  <div
    class="relative flex min-h-0 min-w-0 w-full flex-1 flex-col"
    data-cy="message-list-root"
  >
    <div
      ref="containerRef"
      data-cy="message-list"
      class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 touch-pan-y"
      v-scrollbar-on-scroll
      :class="scrollContainerPaddingBottomClass"
      :style="{ paddingTop: `${scrollContainerPaddingTopPx}px` }"
    >
      <div
        v-if="showHistorySkeleton"
        class="flex min-h-0 w-full flex-1 items-center justify-center py-10"
        role="status"
        aria-live="polite"
        aria-label="Loading messages"
      >
        <svg
          class="echo-ios-spinner"
          viewBox="0 0 44 44"
          width="34"
          height="34"
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
      <div
        v-else-if="showTransitionSkeleton"
        class="flex min-h-0 w-full flex-1 items-center justify-center py-10"
        role="status"
        aria-live="polite"
        aria-label="Loading conversation"
      >
        <svg
          class="echo-ios-spinner"
          viewBox="0 0 44 44"
          width="34"
          height="34"
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
      <div
        v-else-if="showNoServersYet"
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
          :hello-nudge="props.dmHistoryIntro.helloNudge"
          :avatar-url="props.dmHistoryIntro.avatarUrl"
          :status-nugget="props.dmHistoryIntro.statusNugget"
          :mutual-communities-count="
            props.dmHistoryIntro.mutualCommunitiesCount
          "
          :primary-action-label="props.dmHistoryIntro.primaryActionLabel"
          :on-primary-action="props.dmHistoryIntro.onPrimaryAction"
        />
        <div
          class="relative w-full min-h-0"
          :style="{ height: `${virtualizer.getTotalSize()}px` }"
        >
          <div
            v-for="virtualRow in virtualizer.getVirtualItems()"
            :key="displayOrderedIds[virtualRow.index] ?? ''"
            :data-index="virtualRow.index"
            :ref="measureRowRef"
            class="absolute left-0 top-0 w-full max-w-full [contain:layout]"
            :style="{ transform: `translateY(${virtualRow.start}px)` }"
          >
            <div class="w-full max-w-full">
              <MessageBubble
                :ref="
                  getMessageBubbleRef(
                    messageListRowPresentations[virtualRow.index]?.message?.id,
                  )
                "
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
                :save-message-edit="forwardSaveEdit"
                :on-go-to-channel="onGoToChannel"
                :on-go-to-message="onGoToMessage"
                :on-open-profile="onOpenProfile"
                @delete="forwardBubbleDelete"
                @reply="forwardBubbleReply"
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
    <MessageListJumpFab
      :message-scroll-anchor="messageScrollAnchorResolved"
      :message-count="displayOrderedIds.length"
      :list-ui-blocked="
        showHistorySkeleton ||
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
</style>
