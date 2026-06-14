<script setup lang="ts">
import {
  ref,
  provide,
  computed,
  watch,
  nextTick,
  inject,
  onMounted,
  onUnmounted,
  onErrorCaptured,
  getCurrentInstance,
  type Ref,
} from 'vue';
import { storeToRefs } from 'pinia';
import { useChatCustomEmojiResolvers } from '@/composables/useChatCustomEmojiResolvers';
import { useEchoHistory } from '@/composables/useEchoHistory';
import type {
  ChannelSummary,
  EditingMessage,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageWithAuthor,
  ReplyTo,
  EchoChannelType,
} from '@shared/types';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import MessageList from './MessageList.vue';
import ChatInput from './ChatInput.vue';
import ChatTypingIndicator from './ChatTypingIndicator.vue';
import ImageViewerModal from './ImageViewerModal.vue';
import DocumentViewerModal from './DocumentViewerModal.vue';
import type { ImageItem } from './ImageViewerModal.vue';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { MemberRole, PopoutAnchorRect } from '@/utils/memberProfiles';
import { useServerStore } from '@/stores/server';
import { extractMarkdownHeadingToc } from '@/composables/useMarkdown';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import {
  CHAT_MESSAGE_NAV_BRIDGE_KEY,
  type ActiveChatMessageNavApi,
} from '@/features/navigation/chatMessageNavBridge';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { getParentChannelIdOrNull } from '@/features/forums/domain/forumPostChannel';
import { dbgReadState } from '@/utils/echoReadStateDebug';
import { isEchoMessageLogicallyOwn } from '@/features/chat/domain/discordTwinMessageOwnership';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';
import { useChannelTypingStore } from '@/stores/channelTyping';
import { extractChatImageSearchSeeds } from '@/utils/imageSearchSeedKeywords';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';
import { useEchoChatBottomChromeReporter } from '@/features/layout/composables/useEchoChatBottomChromeReporter';
import SelfAssignableRolesWidget from '@/features/self-roles/components/SelfAssignableRolesWidget.vue';
import EmojiInspectCard from '@/features/chat/components/EmojiInspectCard.vue';
import { useEmojiInspect } from '@/composables/useEmojiInspect';
import {
  buildEditingMessageFromRow,
  isMessageEditableInComposer,
} from '@/features/chat/editor/messageEditDraft';

const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);
const chatColumnRef = ref<HTMLElement | null>(null);
const chatBottomChromeRef = ref<HTMLElement | null>(null);

const chatMessageNavBridge = inject(CHAT_MESSAGE_NAV_BRIDGE_KEY, null);
const chatNavBridgeId = getCurrentInstance()?.uid ?? 0;

const chatMessageNavApi: ActiveChatMessageNavApi = {
  scrollToMessage: async (messageId) => {
    const list = messageListRef.value;
    if (!list) return false;
    return list.scrollMessageIntoView(messageId);
  },
  flashHighlight: (messageId) => {
    messageListRef.value?.flashMessageHighlight(messageId);
  },
};

onMounted(() => {
  if (chatMessageNavBridge && chatNavBridgeId) {
    chatMessageNavBridge.register(chatNavBridgeId, chatMessageNavApi);
  }
});

onUnmounted(() => {
  if (chatMessageNavBridge && chatNavBridgeId) {
    chatMessageNavBridge.unregister(chatNavBridgeId);
  }
});

/** Prevents a single render/runtime error in the message subtree from wedging the whole layout shell. */
onErrorCaptured((err, _instance, info) => {
  if (import.meta.env.DEV) {
    console.error('[ChatView] subtree error', err, info);
  }
  dispatchAppToast(
    'Something went wrong in chat. Try another channel or refresh.',
    'warning',
  );
  return false;
});

/** Shared state for markdown preview expand: ChatInput updates, ChatView renders expanded slot */
const markdownPreviewState = ref<{ html: string; expanded: boolean }>({
  html: '',
  expanded: false,
});
provide('markdownPreviewState', markdownPreviewState);

/** Match MessageList `FOLLOW_NEW_DETACH_PX` — user is “at the end” for composer nudges. */
const KEEP_LATEST_NEAR_BOTTOM_PX = 280;

function keepLatestMessageVisible(smooth = false, force = false) {
  const messageList = messageListRef.value;
  if (!messageList) return;
  if (!force && !messageList.isNearBottom(KEEP_LATEST_NEAR_BOTTOM_PX)) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      messageList.scrollToBottom(smooth);
      if (smooth) {
        requestAnimationFrame(() => {
          messageList.scrollToBottom(false);
        });
      } else if (force) {
        requestAnimationFrame(() => {
          messageList.scrollToBottom(false);
        });
      }
    });
  });
}

provide('keepLatestMessageVisible', keepLatestMessageVisible);

function collapseMarkdownPreview() {
  markdownPreviewState.value = {
    ...markdownPreviewState.value,
    expanded: false,
  };
}

const expandedMarkdownPreviewRootRef = ref<HTMLElement | null>(null);

const markdownExpandedHeadingToc = computed(() =>
  markdownPreviewState.value.expanded
    ? extractMarkdownHeadingToc(markdownPreviewState.value.html)
    : [],
);

function scrollExpandedMarkdownHeadingIntoView(id: string) {
  void nextTick(() => {
    const root = expandedMarkdownPreviewRootRef.value;
    if (!root) return;
    const el = (() => {
      try {
        return root.querySelector(`#${CSS.escape(id)}`);
      } catch {
        return root.querySelector(`[id="${id.replace(/"/g, '')}"]`);
      }
    })();
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

type EchoChannelHistory = ReturnType<typeof useEchoHistory>;
const echoChannelHistory = inject<EchoChannelHistory | null>(
  'echoChannelHistory',
  null,
);
const echoInitialHistoryLoading = computed(
  () => echoChannelHistory?.initialLoading.value ?? false,
);
const echoLoadingOlder = computed(
  () => echoChannelHistory?.loadingOlder.value ?? false,
);
const echoAttention = useEchoAttentionStore();
const { channelAttentionByChannelId, readStateByChannelId } =
  storeToRefs(echoAttention);

const forumParentChannelId = computed(() =>
  props.activeChannel ? getParentChannelIdOrNull(props.activeChannel) : null,
);
const showBackToForum = computed(() => !!forumParentChannelId.value);
const showFloatingForumBackButton = computed(
  () => showBackToForum.value && props.hideFloatingForumBackButton !== true,
);

function debugForumNavLog(payload: unknown) {
  try {
    if (!import.meta.env.DEV) return;
    if (localStorage.getItem('echo_debug_forum_nav') !== '1') return;
    // eslint-disable-next-line no-console
    console.debug('[forum-nav]', payload);
  } catch {
    // ignore
  }
}

/** When a message is being edited, this receives emoji inserts. ChatInput uses it. */
const props = defineProps<{
  activeChannel: ChannelSummary | null;
  activeChannelMessages: Map<
    string,
    MessageWithAuthor & { channelName?: string }
  >;
  /** Current server id for role-colored author names (e.g. selectedServer?.id ?? 'echo') */
  serverId?: string;
  /** Same as member list: Echo hoisted top role color. Omit in voice side chat. */
  resolveAuthorRole?: (userId: string) => MemberRole;
  users?: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    username?: string;
    nickname?: string;
  }[];
  /** When set, composer `@` suggestions use this list instead of `users`. */
  mentionUsers?: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    username?: string;
    nickname?: string;
  }[];
  /** Mentionable guild roles for `@` suggestions (server channels only). */
  mentionRoles?: {
    id: string;
    name: string;
    color?: string;
  }[];
  channels?: {
    id: string;
    name: string;
    type?: EchoChannelType;
    iconKey?: string;
  }[];
  sendMessage?: (
    channelId: string,
    content: string,
    mentions?: import('@shared/types').MentionEntity[],
    imageUrl?: string,
    poll?: import('@shared/types').PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
    contentJson?: unknown,
    contentSchemaVersion?: number,
    forwardMessageId?: string,
    forwardPreview?: ForwardedFrom,
  ) => void;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  currentUserId?: string;
  linkedDiscordUserId?: string | null;
  currentUserName?: string;
  /** Fallback avatar when the voter is not in `users` (usually the current user). */
  currentUserPfp?: string;
  onPollVote?: (messageId: string, optionId: string) => void;
  onSaveEdit?: (
    messageId: string,
    newContent: string,
    attachments?: MessageAttachmentPayload[],
    composerBody?: {
      contentJson?: Record<string, unknown>;
      mentions?: import('@shared/types').MentionEntity[];
    },
  ) => boolean | void | Promise<boolean | void>;
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
  onReact?: (messageId: string, emoji: string) => void;
  onGoToChannel?: (channelId: string) => void;
  onGoToMessage?: (channelId: string, messageId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  onOpenProfileFromContextMenu?: (userId: string) => void;
  /**
   * Local-only pins (DM / non-server chat). Omit for **server channels** — pinned messages are not a product feature there.
   */
  pinnedMessageIds?: string[];
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  canModerateAuthor?: (authorId: string) => boolean;
  onModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  /** When true, show chat input for voice channels (e.g. in call view side chat) */
  showInputForVoiceChannel?: boolean;
  /** When true, message list uses minimal top padding (e.g. voice side chat has its own header) */
  compactTop?: boolean;
  /**
   * Optional override for how many pixels the message list should reserve under the global shell header.
   * Used when the shell header is taller than the normal `h-12` strip (e.g. DM quarter-call chrome).
   */
  headerOverlayInsetPx?: number;
  /** Full-area blur gate for NSFW server channels before the user acknowledges. */
  showNsfwGate?: boolean;
  onNsfwAcknowledge?: () => void;
  onNsfwDecline?: () => void;
  /** Empty main column when user has no guild channels — MessageList shows explore CTA. */
  noServersYet?: boolean;
  onOpenExplore?: () => void;
  /** Quick-react bar: last 3 reaction emojis (MRU) from layout / local persistence. */
  topReactions?: ReactionFavorite[];
  /** Remove one emoji from the quick-react MRU (e.g. right-click on hover bar). */
  removeReactionFavorite?: (emoji: string) => void;
  /** Server owner / manage-server — empty-channel Discord message import CTA. */
  canShowDiscordChannelImport?: boolean;
  /** Transient navigation/loading state (e.g. opening DM thread) to suppress empty-state copy. */
  transitionLoading?: boolean;
  /** Guild channel tree / active channel still settling on servers rail. */
  guildShellSettling?: boolean;
  /**
   * Parent already provides a back affordance (e.g. forum post split header).
   * Hides the floating top-right "Back to forum" pill only; message list forum styling unchanged.
   */
  hideFloatingForumBackButton?: boolean;
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

const channelTypingStore = useChannelTypingStore();
/** Others typing in the active channel — drives `ChatTypingIndicator` visibility. */
const othersTypingCount = computed(() => {
  const cid = props.activeChannel?.id?.trim();
  if (!cid) return 0;
  return channelTypingStore.typersFor(cid, props.currentUserId).length;
});

/** Voice/stage side chat composer (CallView column); not the main text-channel shell. */
const showVoiceSideChatComposer = computed(() => {
  const ch = props.activeChannel;
  if (!ch || !props.showInputForVoiceChannel) return false;
  return ch.type === 'voice' || ch.type === 'stage';
});

const isSelfRolesWidgetChannel = computed(
  () => props.activeChannel?.type === 'selfRoles',
);

const showSelfAssignableRolesWidget = computed(
  () => props.activeChannel?.type === 'selfRoles',
);

const messageListUsesCompactTop = computed(() => props.compactTop);

const showChatTypingIndicatorUi = computed(() => {
  const ch = props.activeChannel;
  if (!ch) return false;
  if (ch.type === 'text') return true;
  return showVoiceSideChatComposer.value;
});

const gifPopoutSeedKeywords = computed(() =>
  extractChatImageSearchSeeds(props.activeChannelMessages.values()),
);

watch(othersTypingCount, (n, prev) => {
  if (!showChatTypingIndicatorUi.value) return;
  if (markdownPreviewState.value.expanded) return;
  const prevN = prev ?? 0;
  if (prevN !== 0 || n === 0) return;
  nextTick(() => {
    requestAnimationFrame(() => {
      keepLatestMessageVisible(false, false);
    });
  });
});

useEchoChatBottomChromeReporter(chatBottomChromeRef, {
  onLayoutGrowth: () => {
    if (markdownPreviewState.value.expanded) return;
    keepLatestMessageVisible(false, false);
  },
});

const activeChannelFirstUnreadMessageId = computed(() => {
  const channelId = props.activeChannel?.id?.trim();
  if (!channelId) return null;
  return (
    channelAttentionByChannelId.value[channelId]?.firstUnreadMessageId ?? null
  );
});

/** Prefer Pinia read-state (socket patches); fall back to last attention summary row. */
const activeChannelLastReadMessageId = computed(() => {
  const channelId = props.activeChannel?.id?.trim();
  if (!channelId) return null;
  const fromReadMap = readStateByChannelId.value[channelId];
  if (fromReadMap !== undefined) return fromReadMap;
  return (
    channelAttentionByChannelId.value[channelId]?.lastReadMessageId ?? null
  );
});

function handleSeenMessageIdChanged(messageId: string | null) {
  dbgReadState('chat_view_seen_message_id_changed', {
    channelId: props.activeChannel?.id ?? null,
    seenMessageId: messageId,
  });
  echoChannelHistory?.reportSeenMessageId(
    messageId,
    props.activeChannel?.id?.trim() ?? null,
  );
}

watch(
  () => props.activeChannel?.id ?? '',
  () => {
    echoChannelHistory?.reportSeenMessageId(null, null);
    debugForumNavLog({
      channelId: props.activeChannel?.id ?? null,
      parentChannelId: forumParentChannelId.value,
      showBackToForum: showBackToForum.value,
      activeChannel: props.activeChannel ?? null,
    });
  },
  { immediate: true },
);

const reactionFavoritesTop = computed(() => props.topReactions ?? []);
const removeReactionFavoriteRef = computed(() => props.removeReactionFavorite);
provide('reactionFavorites', {
  topReactions: reactionFavoritesTop,
  removeReactionFavorite: removeReactionFavoriteRef,
});

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );

function registerComposerInsertUserMention(fn: InsertUserMentionFn | null) {
  if (composerInsertUserMention) composerInsertUserMention.value = fn;
}

function isLikelyGifUrl(url: string | undefined): boolean {
  return isLikelyGifImageUrl(url);
}

const imageViewerOpen = ref(false);
const imageViewerIndex = ref(0);
/** When the clicked URL is not in `imageList` (encoding drift, etc.), show this single image. */
const imageViewerFallback = ref<ImageItem[] | null>(null);

/** All in-channel images for the viewer: legacy `imageUrl` + sticker images + attachment images (deduped). */
const imageList = computed<ImageItem[]>(() => {
  const cid = props.activeChannel?.id?.trim();
  if (cid) {
    const fromIndex = messageReadFacade.getChannelImageUrls(cid).value;
    return fromIndex.map((url) => ({
      url,
      isGif: isLikelyGifUrl(url),
    }));
  }
  const msgs =
    props.activeChannelMessages?.size > 0
      ? Array.from(props.activeChannelMessages.values())
      : [];
  const out: ImageItem[] = [];
  const seen = new Set<string>();
  function pushUrl(url: string | undefined, isGif: boolean) {
    const u = url?.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, isGif });
  }
  for (const m of msgs) {
    if (m.imageUrl) {
      pushUrl(m.imageUrl, !!(m.gif || isLikelyGifUrl(m.imageUrl)));
    }
    const stickers = m.stickers;
    if (Array.isArray(stickers)) {
      for (const sticker of stickers) {
        if (!sticker?.url || sticker.format === 'lottie') continue;
        pushUrl(sticker.url, sticker.format === 'gif');
      }
    }
    const atts = m.attachments;
    if (!Array.isArray(atts)) continue;
    for (const att of atts) {
      if (!att?.url || att.kind === 'video' || att.kind === 'document')
        continue;
      const gif = att.kind === 'gif' || isLikelyGifUrl(att.url);
      pushUrl(att.url, gif);
    }
  }
  return out;
});

const imageListForViewer = computed(() =>
  imageViewerFallback.value?.length
    ? imageViewerFallback.value
    : imageList.value,
);

watch(imageViewerOpen, (open) => {
  if (!open) imageViewerFallback.value = null;
});

function openImageViewer(imageUrl: string) {
  const url = imageUrl.trim();
  if (!url) return;
  const idx = imageList.value.findIndex((i) => i.url === url);
  if (idx >= 0) {
    imageViewerFallback.value = null;
    imageViewerIndex.value = idx;
  } else {
    imageViewerFallback.value = [{ url, isGif: isLikelyGifUrl(url) }];
    imageViewerIndex.value = 0;
  }
  imageViewerOpen.value = true;
}
provide('openImageViewer', openImageViewer);

const documentViewerOpen = ref(false);
const documentViewerDocument = ref<MessageAttachmentPayload | null>(null);

function openDocumentViewer(att: MessageAttachmentPayload) {
  if (att.kind !== 'document') return;
  const u = att.url?.trim();
  if (!u) return;
  documentViewerDocument.value = att;
  documentViewerOpen.value = true;
}

watch(documentViewerOpen, (open) => {
  if (!open) documentViewerDocument.value = null;
});

provide('openDocumentViewer', openDocumentViewer);

const serverStore = useServerStore();

const chatCustomEmoji = useChatCustomEmojiResolvers({
  serverId: computed(() => props.serverId),
  users: computed(() => props.users as UserForAuthor[] | undefined),
  channels: computed(() => props.channels as ChannelSummary[] | undefined),
  activeChannelMessages: computed(() => props.activeChannelMessages),
});

provide('ensureCustomEmojiId', chatCustomEmoji.ensureEmojiId);
provide('customEmojiUrlById', chatCustomEmoji.customEmojiUrlById);
provide('idTokenResolvers', chatCustomEmoji.idTokenResolvers);

const {
  open: emojiInspectOpen,
  info: emojiInspectInfo,
  triggerRect: emojiInspectTriggerRect,
  close: closeEmojiInspect,
} = useEmojiInspect({
  rootRef: chatColumnRef,
  serverId: computed(() => props.serverId),
  customEmojiUrlById: chatCustomEmoji.customEmojiUrlById,
});

const isDiscordImportedServer = computed(() => {
  const s = serverStore.servers.find((s) => s.id === props.serverId);
  return !!s?.discordGuildId;
});

const replyingTo = ref<ReplyTo | null>(null);
const editingMessage = ref<EditingMessage | null>(null);
/**
 * Slowmode support: compute the timestamp of the last message authored by the current user
 * in the active channel so the composer can display a remaining cooldown visually.
 */
const lastOwnMessageAt = computed(() => {
  const msgs =
    props.activeChannelMessages?.size > 0
      ? Array.from(props.activeChannelMessages.values())
      : [];
  const me = props.currentUserId;
  if (!me || !msgs.length) return null;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (
      m &&
      isEchoMessageLogicallyOwn(m, me, props.linkedDiscordUserId) &&
      m.timestamp
    ) {
      return String(m.timestamp);
    }
  }
  return null;
});

const lastOwnEditableMessageId = computed(() => {
  const msgs =
    props.activeChannelMessages?.size > 0
      ? Array.from(props.activeChannelMessages.values())
      : [];
  const me = props.currentUserId;
  if (!me || !msgs.length) return null;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (!m || !m.id) continue;
    if (!isEchoMessageLogicallyOwn(m, me, props.linkedDiscordUserId)) continue;
    if (
      !isMessageEditableInComposer({
        id: m.id,
        content: m.content,
        contentText: m.contentText,
        contentJson: m.contentJson,
        messageFormatVersion: m.messageFormatVersion,
        attachments: m.attachments,
        videoUrl: m.videoUrl,
        imageUrl: m.imageUrl,
        stickers: m.stickers,
      })
    ) {
      continue;
    }
    return m.id;
  }
  return null;
});

async function requestEditLastOwnMessage(): Promise<boolean> {
  const id = lastOwnEditableMessageId.value;
  if (!id) return false;
  const m = props.activeChannelMessages?.get(id);
  if (!m) return false;
  handleEdit(m as MessageWithAuthor & { channelName?: string });
  return true;
}

function clearEditing() {
  if (!editingMessage.value) return;
  chatInputRef.value?.cancelEditMode();
  editingMessage.value = null;
}

function handleClearEdit() {
  editingMessage.value = null;
}

async function scrollToEditingMessage(messageId: string) {
  const id = messageId.trim();
  if (!id) return;
  await ensureMessageInWindowForActiveChannel(id);
  await nextTick();
  const list = messageListRef.value;
  if (!list) return;
  await list.scrollMessageIntoView(id);
  list.flashMessageHighlight(id);
}

async function handleEdit(msg: MessageWithAuthor & { channelName?: string }) {
  if (!msg.id) return;
  replyingTo.value = null;
  const snapshot = buildEditingMessageFromRow({
    id: msg.id,
    content: msg.content,
    contentText: msg.contentText,
    contentJson: msg.contentJson,
    messageFormatVersion: msg.messageFormatVersion,
    mentions: msg.mentions,
    attachments: msg.attachments,
    videoUrl: msg.videoUrl,
    imageUrl: msg.imageUrl,
    stickers: msg.stickers,
  });
  if (!snapshot) return;
  editingMessage.value = snapshot;
  void scrollToEditingMessage(msg.id!);
}

function resolvePollVoterDisplay(userId: string): string {
  if (props.currentUserId && userId === props.currentUserId) {
    return props.currentUserName?.trim() || 'You';
  }
  const u = props.users?.find((x) => x.id === userId);
  if (u?.name?.trim()) return u.name.trim();
  return peerDisplayNamePlaceholder(userId);
}

function resolvePollVoterAvatar(userId: string): string | undefined {
  const u = props.users?.find((x) => x.id === userId);
  if (u?.pfp?.trim()) return u.pfp.trim();
  if (props.currentUserId === userId && props.currentUserPfp?.trim()) {
    return props.currentUserPfp.trim();
  }
  return undefined;
}

async function ensureMessageInWindowForActiveChannel(
  messageId: string,
): Promise<boolean> {
  const cid = props.activeChannel?.id?.trim();
  const prefetch = echoChannelHistory?.prefetchUntilMessageVisible;
  if (!cid || !prefetch || !messageId.trim()) return false;
  await prefetch(cid, messageId.trim());
  return true;
}

function handleReply(msg: MessageWithAuthor & { channelName?: string }) {
  if (!msg.id) return;
  clearEditing();
  replyingTo.value = {
    messageId: msg.id,
    authorId: msg.authorId,
    authorName: msg.author.name,
    authorAvatar: msg.author.avatar,
    content:
      msg.content ??
      (msg.videoUrl
        ? '[Video]'
        : msg.imageUrl
          ? '[Image]'
          : msg.stickers?.length
            ? '[Sticker]'
            : ''),
  };
  void (async () => {
    await nextTick();
    const list = messageListRef.value;
    if (list && msg.id) await list.scrollMessageIntoView(msg.id);
  })();
}
</script>

<template>
  <div
    ref="chatColumnRef"
    class="flex flex-col relative min-w-0 flex-1 min-h-0 overflow-hidden bg-[var(--echo-chat-view-bg)]"
  >
    <ImageViewerModal
      v-model="imageViewerOpen"
      :images="imageListForViewer"
      :initial-index="imageViewerIndex"
    />
    <DocumentViewerModal
      v-model="documentViewerOpen"
      :attachment="documentViewerDocument"
    />
    <EmojiInspectCard
      :open="emojiInspectOpen"
      :info="emojiInspectInfo"
      :trigger-rect="emojiInspectTriggerRect"
      @close="closeEmojiInspect"
    />
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <button
        v-if="showFloatingForumBackButton"
        type="button"
        class="chat-focus-ring absolute right-3 top-3 z-30 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg-soft backdrop-blur-xl transition-colors hover:bg-glass-3 hover:text-foreground"
        @click="
          forumParentChannelId &&
          onGoToChannel &&
          onGoToChannel(forumParentChannelId)
        "
      >
        Back to forum
      </button>
      <!-- Opening a channel: always anchor to latest; go-to-message / search / links scroll via nav bridge. -->
      <SelfAssignableRolesWidget
        v-if="serverId && activeChannel?.id && showSelfAssignableRolesWidget"
        :server-id="serverId"
        :channel-id="activeChannel.id"
        :channel-type="activeChannel.type"
        :channel-display-name="activeChannel.name"
        :header-overlay-inset-px="headerOverlayInsetPx"
      />
      <MessageList
        v-if="!isSelfRolesWidgetChannel"
        v-show="!markdownPreviewState.expanded"
        ref="messageListRef"
        class="flex-1 min-h-0"
        :messages="activeChannelMessages"
        :has-channel="!!activeChannel"
        :header-overlay-inset-px="headerOverlayInsetPx"
        :compact-top="messageListUsesCompactTop"
        :channel-id="activeChannel?.id"
        :server-id="serverId"
        :resolve-author-role="resolveAuthorRole"
        :current-user-id="currentUserId"
        :linked-discord-user-id="linkedDiscordUserId"
        :current-user-name="currentUserName"
        :resolve-poll-voter-display="resolvePollVoterDisplay"
        :resolve-poll-voter-avatar="resolvePollVoterAvatar"
        :on-poll-vote="onPollVote"
        :on-fill-image-slot="onFillImageSlot"
        :on-delete="onDelete"
        :on-reply="handleReply"
        :on-edit="handleEdit"
        :on-react="onReact"
        :on-go-to-channel="onGoToChannel"
        :on-go-to-message="onGoToMessage"
        :on-open-profile="onOpenProfile"
        :on-open-profile-from-context-menu="onOpenProfileFromContextMenu"
        :pinned-message-ids="pinnedMessageIds"
        :on-pin="onPin"
        :on-unpin="onUnpin"
        :can-moderate-author="canModerateAuthor"
        :on-moderate-user="onModerateUser"
        :load-older="echoChannelHistory?.loadOlder"
        :ensure-message-in-window="ensureMessageInWindowForActiveChannel"
        :loading-older="echoLoadingOlder"
        :initial-history-loading="echoInitialHistoryLoading"
        :transition-loading="transitionLoading"
        :guild-shell-settling="guildShellSettling"
        :no-servers-yet="noServersYet"
        :on-open-explore="onOpenExplore"
        :is-discord-imported-server="isDiscordImportedServer"
        :discord-channel-id="activeChannel?.discordChannelId"
        :channel-name="activeChannel?.name"
        :channel-type="activeChannel?.type"
        :is-forum-post-channel="showBackToForum"
        :can-show-discord-channel-import="
          !!canShowDiscordChannelImport && isDiscordImportedServer
        "
        :on-request-forward="onRequestForward"
        :first-unread-message-id="activeChannelFirstUnreadMessageId"
        :last-read-message-id="activeChannelLastReadMessageId"
        :show-unread-separator="false"
        :dm-history-intro="dmHistoryIntro ?? null"
        @imported="echoChannelHistory?.reload()"
        @seen-message-id-changed="handleSeenMessageIdChanged"
      />

      <div
        v-show="markdownPreviewState.expanded"
        class="chat-markdown-expanded-root flex-1 min-h-0 flex flex-col overflow-hidden pt-12"
      >
        <div
          v-if="markdownExpandedHeadingToc.length > 0"
          class="chat-markdown-expanded-toc-mobile flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 md:hidden custom-scrollbar"
        >
          <button
            v-for="item in markdownExpandedHeadingToc"
            :key="item.id"
            type="button"
            class="chat-focus-ring chat-markdown-expanded-toc-chip max-w-[11rem] shrink-0 truncate rounded-lg px-2.5 py-1 text-left text-[11px] transition-colors"
            :title="item.text"
            @click="scrollExpandedMarkdownHeadingIntoView(item.id)"
          >
            {{ item.text }}
          </button>
        </div>
        <div
          class="markdown-preview-expanded flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
        >
          <aside
            v-if="markdownExpandedHeadingToc.length > 0"
            class="chat-markdown-expanded-aside hidden w-48 shrink-0 flex-col overflow-y-auto py-2 pl-3 pr-2 md:flex custom-scrollbar"
          >
            <div
              class="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted"
            >
              On this page
            </div>
            <button
              v-for="item in markdownExpandedHeadingToc"
              :key="item.id"
              type="button"
              class="chat-focus-ring chat-markdown-expanded-toc-row w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors"
              :class="{
                'pl-2': item.depth <= 1,
                'pl-3': item.depth === 2,
                'pl-4': item.depth === 3,
                'pl-5': item.depth >= 4,
              }"
              :title="item.text"
              @click="scrollExpandedMarkdownHeadingIntoView(item.id)"
            >
              {{ item.text }}
            </button>
          </aside>
          <div
            ref="expandedMarkdownPreviewRootRef"
            v-spoiler-reveal
            class="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 py-3"
          >
            <div
              class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
            >
              Markdown preview
            </div>
            <div
              class="markdown-preview__content text-sm break-words"
              v-html="markdownPreviewState.html"
            />
          </div>
        </div>
        <div class="flex-shrink-0 px-4 pb-2">
          <button
            type="button"
            class="chat-focus-ring chat-markdown-expanded-collapse text-xs text-muted hover:text-foreground px-2 py-1 rounded"
            @click="collapseMarkdownPreview"
          >
            Collapse preview
          </button>
        </div>
      </div>

      <div
        v-if="
          activeChannel &&
          (activeChannel.type === 'text' || showVoiceSideChatComposer)
        "
        ref="chatBottomChromeRef"
        data-echo-chat-bottom-chrome
        class="chat-bottom-chrome-stack flex-shrink-0"
      >
        <ChatTypingIndicator
          v-if="showChatTypingIndicatorUi"
          class="flex-shrink-0"
          :channel-id="activeChannel.id"
          :server-id="serverId"
          :exclude-user-id="currentUserId"
        />
        <ChatInput
          ref="chatInputRef"
          class="flex-shrink-0"
          :channel-name="activeChannel.name"
          :channel-id="activeChannel.id"
          :server-id="serverId"
          :users="users"
          :mention-users="mentionUsers"
          :mention-roles="mentionRoles"
          :channels="channels"
          :send-message="sendMessage"
          :replying-to="replyingTo"
          :editing-message="editingMessage"
          :on-save-edit="onSaveEdit"
          :slowmode-interval="activeChannel?.slowModeSeconds ?? 0"
          :last-own-message-at="lastOwnMessageAt"
          :request-edit-last-message="requestEditLastOwnMessage"
          :register-insert-user-mention="
            composerInsertUserMention
              ? registerComposerInsertUserMention
              : undefined
          "
          :gif-popout-seed-keywords="gifPopoutSeedKeywords"
          :message-format-template="activeChannel.messageFormatTemplate"
          :message-format-hard="activeChannel.messageFormatHard === true"
          @clear-reply="replyingTo = null"
          @clear-edit="handleClearEdit"
          @scroll-to-edit-target="scrollToEditingMessage"
        />
      </div>

      <div
        v-if="showNsfwGate"
        class="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-overlay-heavy px-5 backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nsfw-gate-title"
      >
        <div class="max-w-md space-y-4 text-center">
          <h2
            id="nsfw-gate-title"
            class="text-xl font-bold tracking-tight text-foreground"
          >
            Age-restricted channel
          </h2>
          <p class="text-sm leading-relaxed text-fg-soft">
            This channel is marked as NSFW. By continuing you confirm you are 18
            or older and choose to view potentially mature content.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              v-if="onNsfwDecline"
              type="button"
              class="chat-focus-ring rounded-lg px-4 py-2.5 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="onNsfwDecline"
            >
              Go back
            </button>
            <button
              type="button"
              class="chat-focus-ring rounded-lg bg-rose-600/90 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-950/40 transition-colors hover:bg-rose-600"
              @click="onNsfwAcknowledge?.()"
            >
              Enter channel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/chat/styles/markdownAlerts.scss' as mdAlerts;
.chat-markdown-expanded-root {
  border-bottom: 1px solid var(--border);
}

.chat-markdown-expanded-toc-mobile {
  border-bottom: 1px solid var(--border);
}

.chat-markdown-expanded-aside {
  border-bottom: 1px solid var(--border);

  @media (width >= 48rem) {
    border-bottom: none;
    border-right: 1px solid var(--border);
  }
}

.chat-markdown-expanded-toc-chip {
  border: 1px solid var(--border);
  background: var(--glass-tint);
  color: var(--muted);
}

.chat-markdown-expanded-toc-chip:hover {
  background: var(--vue-auto-003);
  color: var(--text);
}

.chat-markdown-expanded-toc-row {
  color: var(--muted);
}

.chat-markdown-expanded-toc-row:hover {
  background: var(--vue-auto-003);
  color: var(--text);
}

.chat-markdown-expanded-collapse:hover {
  background: var(--vue-auto-003);
}

/* Reuse markdown preview content styles for expanded view */
.markdown-preview-expanded :deep(.markdown-preview__content) {
  color: var(--vue-auto-009);
  @include mdAlerts.echo-markdown-alerts();
}

.markdown-preview-expanded :deep(.markdown-preview__content p:first-child) {
  margin-top: 0;
}

.markdown-preview-expanded :deep(.markdown-preview__content p) {
  margin: 0 0 0.5em;
}

.markdown-preview-expanded :deep(.markdown-preview__content p:last-child) {
  margin-bottom: 0;
}

.markdown-preview-expanded :deep(.markdown-preview__content pre) {
  margin: 0.5em 0;
  overflow-x: auto;
  max-width: 100%;
  border-radius: 6px;
  background: var(--vue-auto-019);
  padding: 0.5em 0.75em;
  font-size: 0.9em;
}

.markdown-preview-expanded :deep(.markdown-preview__content code) {
  border-radius: 4px;
  background: var(--vue-auto-031);
  padding: 0.15em 0.35em;
  font-size: 0.9em;
  overflow-wrap: break-word;
  word-break: break-all;
}

.markdown-preview-expanded :deep(.markdown-preview__content pre code) {
  background: transparent;
  padding: 0;
}

.markdown-preview-expanded :deep(.markdown-preview__content blockquote) {
  margin: 0.5rem 0;
  border-left: 3px solid var(--vue-auto-004);
  padding-left: 0.75rem;
  color: var(--vue-auto-060);
}

.markdown-preview-expanded :deep(.markdown-preview__content ul),
.markdown-preview-expanded :deep(.markdown-preview__content ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-preview-expanded :deep(.markdown-preview__content ul) {
  list-style-type: disc;
}

.markdown-preview-expanded :deep(.markdown-preview__content ol) {
  list-style-type: decimal;
}

.markdown-preview-expanded :deep(.markdown-preview__content li) {
  margin: 0.25em 0;
  display: list-item;
}

.markdown-preview-expanded :deep(.markdown-preview__content a) {
  color: var(--vue-auto-061);
  text-decoration: underline;
}

.markdown-preview-expanded :deep(.markdown-preview__content a:hover) {
  color: var(--vue-auto-062);
}

.markdown-preview-expanded :deep(.markdown-preview__content h1) {
  margin: 0.5em 0 0.25em;
  font-size: 1.35em;
  font-weight: 700;
}

.markdown-preview-expanded :deep(.markdown-preview__content h2) {
  margin: 0.5em 0 0.25em;
  font-size: 1.2em;
  font-weight: 600;
}

.markdown-preview-expanded :deep(.markdown-preview__content h3) {
  margin: 0.5em 0 0.25em;
  font-size: 1.1em;
  font-weight: 600;
}

.markdown-preview-expanded :deep(.markdown-preview__content table) {
  margin: 0.5em 0;
  width: 100%;
  border-collapse: collapse;
}

.markdown-preview-expanded :deep(.markdown-preview__content th),
.markdown-preview-expanded :deep(.markdown-preview__content td) {
  border: 1px solid var(--vue-auto-001);
  padding: 0.35em 0.6em;
}

.markdown-preview-expanded :deep(.markdown-preview__content .emoji) {
  height: 1.1em;
  width: 1.1em;
  vertical-align: -0.15em;
  display: inline-block;
  object-fit: contain;
  cursor: pointer;
  box-sizing: content-box;
}
</style>
