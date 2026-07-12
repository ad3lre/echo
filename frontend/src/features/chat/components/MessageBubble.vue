<script setup lang="ts">
import {
  ref,
  computed,
  inject,
  watch,
  watchEffect,
  nextTick,
  type ComputedRef,
  type Ref,
} from 'vue';
import type {
  Embed,
  MessageAttachmentPayload,
  MessageWithAuthor,
} from '@shared/types';
import { stubVideoEmbedsFromMessage } from '@shared/linkEmbedCandidates';
import { docContainsButtonRows } from '@shared/buttonRowContentJson';
import {
  isInlineGifHostEmbed,
  linkEmbedsExcludingInlineGifs,
} from '@shared/gifHostLinks';
import { mentionsUser, type IdTokenResolvers } from '@/composables/useMarkdown';
import { messageRepliesToUser } from '@shared/attentionPing';
import { isEmojiOnlyUpTo12 } from '@/utils/emojiUtils';
import { renderSingleEmojiHtml } from '@/utils/customEmojiDisplay';
import { isEchoEmojiTokenResolveMiss } from '@/composables/useGlobalEmojiTokenResolver';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { useCustomEmojiImgLoadRecovery } from '@/composables/useCustomEmojiImgLoadRecovery';
import { requestAppConfirmFromContextMenu } from '@/utils/appDialogs';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useShiftKey } from '@/composables/useShiftKey';
import {
  getPopoutAnchorRect,
  getHighestRoleForMember,
  type MemberRole,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';
import { isEchoGraphId } from '@/utils/echoIds';
import PollDisplay from './PollDisplay.vue';
import MessageBubbleInnerBody from '@/features/chat/components/MessageBubbleInnerBody.vue';
import type { BubbleBodyMode } from '@/features/chat/components/MessageBubbleInnerBody.vue';
import {
  isEchoContentSchemaSupportedForRender,
  validateEchoContentJsonForRender,
} from '@/features/chat/editor/echoContentJsonForRender';
import MessageLinkEmbeds from './MessageLinkEmbeds.vue';
import MessageDiscordComponents from './MessageDiscordComponents.vue';
import MessageInlineGifEmbeds from './MessageInlineGifEmbeds.vue';
import MessageAttachments from './MessageAttachments.vue';
import MessageReactions from './MessageReactions.vue';
import MessageHeader from './MessageHeader.vue';
import MessageSendPendingDots from './MessageSendPendingDots.vue';
import MessageReplyPreview from './MessageReplyPreview.vue';
import MessagePreviewSnippet from './MessagePreviewSnippet.vue';
import MessageContextMenu from './MessageContextMenu.vue';
import MessageReactionsVotersModal from './MessageReactionsVotersModal.vue';
import MessageActionBar from './MessageActionBar.vue';
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/stores/devSettings';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import {
  useMessageLink,
  copyToClipboard,
} from '@/features/chat/composables/useMessageLinkActions';
import { copyImageFromUrl } from '@/utils/copyToClipboard';
import { plainTextFromEchoContentJson } from '@/features/chat/editor/echoContentJsonPlainText';
import { plainTextForRawMessage } from '@/services/domain/messageDisplayPlain';
import { markdownFromEchoContentJson } from '@/features/chat/editor/echoContentJsonMarkdown';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { openReportModal } from '@/features/safety/reportModal';
import { linkTokenMessage } from '@/utils/idTokens';
import { useContextMenuPosition } from '@/features/chat/composables/useContextMenuPosition';
import { useImageSlotFill } from '@/features/chat/composables/useImageSlotFill';
import { failResult } from '@/types/actionResult';
import { defaultQuickReactionFavorites } from '@/composables/useReactionFavorites';
import { useMessageBubbleUi } from '@/features/chat/composables/useMessageBubbleUi';
import { useMessageKatexScrollbarReveal } from '@/features/chat/composables/useMessageKatexScrollbarReveal';
import { applyEmbedTitlesToMessageContent } from '@/utils/embedLinkLabels';
import { mergeEchoJumpEmbedsForMessage } from '@/utils/messageJumpContentParse';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { isMessageAuthorOffline } from '@/utils/isOfflinePresence';
import { formatShortTime } from '@/utils/formatTimestamp';
import {
  loadTimeLanguagePreferences,
  timeLanguagePrefsEpoch,
} from '@/features/settings/timeLanguagePreferences';
import type { MagicTimeRenderContext } from '@/features/chat/viewModel/messageContentSegments';
import { useAnchoredFloatingPosition } from '@/composables/useAnchoredFloatingPosition';
import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import { isEchoMessageLogicallyOwn } from '@/features/chat/domain/discordTwinMessageOwnership';
import { isDmCallRollupCollapseMessageId } from '@/features/chat/domain/dmCallLogHistoryCollapse';
import { isOutboundMessageSendPending } from '@/services/realtime/deferredMediaOutboundSend';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { resolveGuildMemberDisplayName } from '@/utils/resolveGuildMemberDisplayName';
import { MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY } from '@/features/chat/composables/messageListScrollGestureKeys';

const contentJsonSignatureCache = new WeakMap<object, string>();

function contentJsonSignature(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) {
    return String(raw ?? '');
  }
  const cached = contentJsonSignatureCache.get(raw);
  if (cached !== undefined) return cached;
  let signature: string;
  try {
    signature = JSON.stringify(raw);
  } catch {
    signature = String(raw);
  }
  contentJsonSignatureCache.set(raw, signature);
  return signature;
}

const props = defineProps<{
  /** Prebuilt row: message, layout, reply preview, separators — from MessageList view model. */
  row: MessageListRowPresentation;
  channelId?: string;
  /** True when rendering inside a forum post channel (not the forum index channel). */
  isForumPostChannel?: boolean;
  /** Current server id for role-colored author name */
  serverId?: string;
  /** Echo / live role color (same resolver as member list). Omit in voice side chat so names stay neutral. */
  resolveAuthorRole?: (userId: string) => MemberRole;
  currentUserId?: string;
  /** When set, Discord-import messages from the same linked Discord account count as own. */
  linkedDiscordUserId?: string | null;
  currentUserName?: string;
  resolvePollVoterDisplay?: (userId: string) => string;
  resolvePollVoterAvatar?: (userId: string) => string | undefined;
  onVote?: (optionId: string) => void;
  onReact?: (emoji: string) => void;
  onGoToChannel?: (channelId: string) => void;
  /** In-app navigation for pasted message links (`echoJump` embeds). */
  onGoToMessage?: (channelId: string, messageId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  /** Message context menu “View profile” → expanded profile modal/panel. */
  onOpenProfileFromContextMenu?: (userId: string) => void;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  /** When set, used to show mod actions on others’ messages (server chat only). */
  canModerateAuthor?: (authorId: string) => boolean;
  fillImageSlot?: (
    messageId: string,
    slotId: string,
    body: {
      imageUrl: string;
      storageKey?: string;
      width?: number;
      height?: number;
    },
  ) => boolean | Promise<boolean>;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
}>();

const emit = defineEmits<{
  delete: [messageId: string];
  reply: [message: MessageWithAuthor & { channelName?: string }];
  edit: [message: MessageWithAuthor & { channelName?: string }];
  expandDmCallRoll: [messageId: string];
  moderateUser: [
    payload: {
      action: 'kick' | 'ban' | 'timeout';
      targetUserId: string;
      timeoutMinutes?: number;
    },
  ];
}>();

const row = computed(() => props.row);
const message = computed(() => props.row.message);

const scrollGestureActive = inject<Ref<boolean>>(
  MESSAGE_LIST_SCROLL_GESTURE_ACTIVE_KEY,
  ref(false),
);
/** Phase 4: keep row mounted; skip costly embed/GIF/reaction subtrees during scroll. */
const throttleHeavyDescendants = computed(() => scrollGestureActive.value);

const magicTimeContext = computed((): MagicTimeRenderContext | null => {
  void timeLanguagePrefsEpoch.value;
  const prefs = loadTimeLanguagePreferences();
  const m = message.value;
  if (m.systemMessage) return null;
  const senderTz =
    typeof m.author?.timeZone === 'string' ? m.author.timeZone.trim() : '';
  if (!senderTz || !m.timestamp) return null;
  if (prefs.timeZone === senderTz) return null;
  return {
    messageTimestampIso: m.timestamp,
    senderTimeZone: senderTz,
    viewerTimeZone: prefs.timeZone,
    viewerLocale: prefs.locale,
  };
});

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);
const notificationPreferences = useNotificationPreferencesStore();
const workspace = useEchoWorkspace();

/** Server nickname (guild) or message author name. */
const authorLabel = computed(() =>
  resolveGuildMemberDisplayName({
    serverId: props.serverId,
    userId: message.value.authorId,
    fallbackName: message.value.author?.name?.trim() || 'Unknown',
    serverMemberNicknames: workspace.serverMemberNicknames.value,
  }),
);

const { shiftPressed } = useShiftKey();
const menuRef = ref<HTMLElement | null>(null);
const contextMenuRef = ref<InstanceType<typeof MessageContextMenu> | null>(
  null,
);
const triggerRef = ref<HTMLElement | null>(null);
const actionBarRef = ref<InstanceType<typeof MessageActionBar> | null>(null);
/** Teleported action bar wrapper — hover/focus bridge between row and floating UI. */
const floatingActionBarWrapRef = ref<HTMLElement | null>(null);

watchEffect(() => {
  const bar = actionBarRef.value as unknown as {
    ellipsisRef?: Ref<HTMLElement | null>;
  } | null;
  triggerRef.value = bar?.ellipsisRef?.value ?? null;
});

const reactTriggerRef = ref<HTMLElement | null>(null);
const menuOpen = ref(false);

watch(
  [() => contextMenuRef.value, menuOpen],
  async ([, open]) => {
    if (!open) {
      menuRef.value = null;
      return;
    }
    await nextTick();
    const vm = contextMenuRef.value as null | {
      getMenuRootElement?: () => HTMLElement | null;
    };
    menuRef.value = vm?.getMenuRootElement?.() ?? null;
  },
  { flush: 'post' },
);
const {
  menuPosition,
  setMenuPositionFromRect,
  setMenuPositionFromPoint,
  fitMenuToViewport,
} = useContextMenuPosition();
const rootRef = ref<HTMLElement | null>(null);
const reactionsRef = ref<InstanceType<typeof MessageReactions> | null>(null);
const hovered = ref(false);
const focusWithin = ref(false);

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );
const openImageViewer = inject<(url: string) => void>('openImageViewer');
const openDocumentViewer = inject<
  ((att: MessageAttachmentPayload) => void) | undefined
>('openDocumentViewer', undefined);
const REACTION_FAVORITES_MISSING = Symbol('reactionFavoritesMissing');
type ReactionFavoritesInject = {
  topReactions: { value: { emoji: string; html: string }[] };
  removeReactionFavorite?: { value: ((emoji: string) => void) | undefined };
};
const injectedReactionFavorites = inject<
  ReactionFavoritesInject | typeof REACTION_FAVORITES_MISSING
>('reactionFavorites', REACTION_FAVORITES_MISSING);
const reactionFavorites: ReactionFavoritesInject =
  injectedReactionFavorites === REACTION_FAVORITES_MISSING
    ? {
        topReactions: { value: [] },
        removeReactionFavorite: { value: undefined },
      }
    : injectedReactionFavorites;

const idTokenResolvers = inject<
  ComputedRef<IdTokenResolvers | undefined> | undefined
>('idTokenResolvers', undefined);
const parseIdResolvers = computed(() => idTokenResolvers?.value);

const customEmojiUrlById = inject<ComputedRef<Map<string, string>> | undefined>(
  'customEmojiUrlById',
  undefined,
);
const ensureCustomEmojiId = inject<((id: string) => void) | undefined>(
  'ensureCustomEmojiId',
  undefined,
);

/**
 * Tracks `idTokenResolvers._cacheVersion` (ChatView bumps when emoji id→url data
 * changes, not only when map size changes). Keeps MessageContentSegments keyed so
 * markdown parse cache invalidation lines up with resolver updates.
 */
const customEmojiRenderKey = computed(
  () => parseIdResolvers?.value?._cacheVersion ?? 0,
);

const displayAttachments = computed(() => message.value.attachments ?? []);

const isSendPending = computed(() => {
  const channelId = props.channelId?.trim();
  const messageId = message.value.id?.trim();
  if (!channelId || !messageId) return false;
  return isOutboundMessageSendPending(channelId, messageId);
});

function parseSingleEmojiForReactions(emoji: string): string {
  return renderSingleEmojiHtml(emoji, {
    cachedById: customEmojiUrlById?.value,
    echoResolveMissed: isEchoEmojiTokenResolveMiss,
    ensureEmojiId: ensureCustomEmojiId,
    allowDiscordCdnGuess: true,
  });
}

/**
 * Hover quick-react bar and edit-mode insert row: layout sends last 3 reaction emojis (MRU).
 * Empty inject uses the same defaults as empty storage.
 */
const quickReactionEmojis = computed(() => {
  const v = reactionFavorites.topReactions?.value ?? [];
  return v.length > 0 ? v : defaultQuickReactionFavorites();
});

function handleRemoveQuickReactionFavorite(emoji: string) {
  const fn = reactionFavorites.removeReactionFavorite?.value;
  if (typeof fn === 'function') fn(emoji);
}

const isOwnMessage = computed(() =>
  isEchoMessageLogicallyOwn(
    message.value,
    props.currentUserId,
    props.linkedDiscordUserId,
  ),
);

const canFillImageSlots = computed(
  () => isOwnMessage.value && !!props.fillImageSlot,
);

const {
  filling: imageSlotUploading,
  fileInputRef: imageSlotFileInputRef,
  openFillPicker,
  onFileSelected: onImageSlotFileSelected,
} = useImageSlotFill({
  channelId: () => props.channelId,
  submitFill: async (channelId, messageId, slotId, payload) => {
    if (!props.fillImageSlot) {
      return failResult('UNAVAILABLE', 'Image slot fill unavailable', false);
    }
    const ok = await Promise.resolve(
      props.fillImageSlot(messageId, slotId, payload),
    );
    return ok
      ? { ok: true }
      : failResult('FILL_FAILED', 'Could not fill image slot', true);
  },
});

function handleFillImageSlot(slotId: string) {
  if (!canFillImageSlots.value || !message.value.id) return;
  openFillPicker(message.value.id, slotId);
}

/** Avatar / gutter mode comes from the list row view model (no neighbor inference here). */
const showAvatarResolved = computed(() => props.row.showAvatar);
const showGutterHoverResolved = computed(() => props.row.showGutterHoverTime);
const continuationLayout = computed(() => !props.row.showAvatar);

const showMentionAuthorInComposer = computed(
  () => !isOwnMessage.value && !!composerInsertUserMention?.value,
);

/**
 * Show embed titles in place of raw URLs when previews exist (compact).
 * Skipped when `mentions` exist — offsets are tied to raw `content`.
 */
const displayMessageContent = computed(() => {
  const raw = plainTextForRawMessage(message.value);
  if (message.value.mentions?.length) return raw;
  return applyEmbedTitlesToMessageContent(raw, message.value.embeds);
});

const isEmojiOnlyBody = computed(() =>
  isEmojiOnlyUpTo12(plainTextForRawMessage(message.value)),
);

/** Inline message-jump cards: stored unfurl + client-detected Echo message URLs in body text. */
const contentEmbedsForSegments = computed(() =>
  mergeEchoJumpEmbedsForMessage(
    displayMessageContent.value,
    message.value.contentJson,
    message.value.embeds,
  ),
);

/** Server unfurl + instant client stubs for YouTube/Vimeo when previews are not stored yet. */
const linkEmbedsForDisplay = computed((): Embed[] | undefined => {
  const stored = message.value.embeds ?? [];
  if (stored.some((e) => !e.echoJump)) return stored;
  const plain = (
    message.value.contentText ??
    message.value.content ??
    ''
  ).trim();
  const stubs = stubVideoEmbedsFromMessage(plain, message.value.contentJson);
  return stubs.length ? stubs : stored;
});

const linkEmbedsForLinkCards = computed((): Embed[] | undefined => {
  const embeds = linkEmbedsForDisplay.value;
  if (!embeds?.length) return embeds;
  return linkEmbedsExcludingInlineGifs(embeds);
});

const hasInlineGifEmbeds = computed(() =>
  (linkEmbedsForDisplay.value ?? []).some(isInlineGifHostEmbed),
);

/** Webhook-only components render below the body; composer button rows render inline from content_json. */
const showStandaloneMessageComponents = computed(() => {
  if (
    !Array.isArray(message.value.components) ||
    !message.value.components.length
  ) {
    return false;
  }
  return !docContainsButtonRows(message.value.contentJson);
});

/** Message body root (markdown / JSON caption) — wires KaTeX overflow scrollbars. */
const messageContentRef = ref<HTMLElement | null>(null);
const messageBubbleShellRef = ref<HTMLElement | null>(null);

const customEmojiUrlByIdForImgRecovery = computed(
  (): ReadonlyMap<string, string> | undefined => customEmojiUrlById?.value,
);
useCustomEmojiImgLoadRecovery(
  messageBubbleShellRef,
  customEmojiUrlByIdForImgRecovery,
);

useMessageKatexScrollbarReveal(messageContentRef, () =>
  [
    displayMessageContent.value,
    customEmojiRenderKey.value,
    message.value.content ?? '',
    contentJsonSignature(message.value.contentJson),
  ].join('\u001e'),
);

const bodyRenderMode = computed((): BubbleBodyMode => {
  const mf = message.value.messageFormatVersion ?? 1;
  if (mf < 2) return { kind: 'markdown' };
  const cs = message.value.contentSchemaVersion ?? 1;
  if (!isEchoContentSchemaSupportedForRender(cs)) {
    return {
      kind: 'error',
      message: 'This message uses a newer format and could not be displayed.',
    };
  }
  const v = validateEchoContentJsonForRender(message.value.contentJson);
  if (!v.ok) {
    return { kind: 'error', message: 'This message could not be displayed.' };
  }
  return { kind: 'json', doc: v.doc };
});

const showTextCaption = computed(() => {
  if (bodyRenderMode.value.kind === 'error') return true;
  if (bodyRenderMode.value.kind === 'json') return true;
  return !!(message.value.content ?? '').trim();
});

const showModActions = computed(() => {
  const fn = props.canModerateAuthor;
  if (!fn || isOwnMessage.value) return false;
  return fn(message.value.authorId);
});
const authorTimeoutActive = computed(() => {
  const sid = props.serverId?.trim();
  if (!sid || sid === 'echo') return false;
  const epochMs =
    workspace.timeoutUntilByServerUser.value[sid]?.[message.value.authorId];
  return (
    typeof epochMs === 'number' &&
    Number.isFinite(epochMs) &&
    epochMs > Date.now()
  );
});

const showForwardInMenu = computed(
  () =>
    !!props.onRequestForward &&
    !!message.value.id &&
    message.value.systemMessage !== true,
);

const hasReactions = computed(
  () => !!(message.value.reactions && message.value.reactions.length > 0),
);
const reactionsVotersModalOpen = ref(false);
const messagePreviewForReactionsModal = computed(() => {
  const t = (message.value.contentText || message.value.content || '').trim();
  if (!t) return '';
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
});

function handleViewReactionsFromMenu() {
  menuOpen.value = false;
  reactionsVotersModalOpen.value = true;
}

const isSystemMessage = computed(() => message.value.systemMessage === true);

const isDmCallRollupCollapseRow = computed(() =>
  isDmCallRollupCollapseMessageId(message.value.id ?? ''),
);

function emitExpandDmCallRoll() {
  const id = message.value.id?.trim();
  if (!id) return;
  emit('expandDmCallRoll', id);
}

const reactionPopoverOpen = ref(false);

const showContextMenu = computed(
  () => !isSystemMessage.value && menuOpen.value,
);
const pollForDisplay = computed(() => {
  const poll = message.value.poll;
  if (!poll) return undefined;
  if (props.isForumPostChannel && row.value.layout.isFirstInList) {
    return undefined;
  }
  return poll;
});

const authorRoleColor = computed(() => {
  if (!props.serverId) return '';
  const resolve = props.resolveAuthorRole;
  if (resolve) return resolve(message.value.authorId).color;
  if (isEchoGraphId(props.serverId)) return '';
  return getHighestRoleForMember(props.serverId, message.value.authorId).color;
});

const authorLooksOffline = computed(() =>
  isMessageAuthorOffline(message.value.author.status),
);

const isRepliedTo = computed(() =>
  messageRepliesToUser(
    message.value.replyTo,
    props.row.replyPreview?.authorId,
    props.currentUserId,
  ),
);

const isMentioned = computed(() =>
  mentionsUser(
    message.value.content,
    message.value.mentions,
    props.currentUserId,
    props.currentUserName,
  ),
);

const shouldHighlightMention = computed(() => {
  if (isRepliedTo.value) return true;
  if (!isMentioned.value) return false;
  if (!notificationPreferences.settings.mentionHighlights) {
    return (
      !!props.currentUserId &&
      message.value.mentions?.some((m) => {
        return m.kind === 'user' && m.userId === props.currentUserId;
      })
    );
  }
  return true;
});

const shortTime = computed(() => {
  const ts = message.value.timestamp;
  const formatted = formatShortTime(ts);
  if (formatted !== ts) return formatted;
  const atIdx = ts.lastIndexOf(' at ');
  return atIdx !== -1 ? ts.slice(atIdx + 4) : ts;
});

/** Accessible label for the article element: "AuthorName, relative-time". */
const bubbleAriaLabel = computed(() => {
  const author = authorLabel.value;
  const ts = message.value.timestamp;
  return ts ? `${author}, ${ts}` : author;
});

const messageLink = useMessageLink(
  computed(() => props.channelId),
  computed(() => message.value.id),
);

/** First raster image URL on the message (for clipboard image copy). */
const copyableMessageImageUrl = computed(() => {
  const m = message.value;
  const atts = m.attachments;
  if (atts?.length) {
    const hit = atts.find((a) => a.kind === 'image' || a.kind === 'gif');
    if (hit?.url) return safeImageUrl(hit.url);
  }
  if (m.imageUrl?.trim()) {
    return safeImageUrl(m.imageUrl);
  }
  const sticker = m.stickers?.[0];
  if (sticker?.url && sticker.format !== 'lottie') {
    return safeImageUrl(sticker.url);
  }
  return null;
});

function messagePlainTextForCopy(): string {
  const base = (
    message.value.contentText ??
    message.value.content ??
    ''
  ).trim();
  if (base) return base;
  const mf = message.value.messageFormatVersion ?? 1;
  if (mf >= 2 && message.value.contentJson !== undefined) {
    const extracted = plainTextFromEchoContentJson(
      message.value.contentJson,
    ).trim();
    if (extracted) return extracted;
  }
  const poll = message.value.poll;
  if (poll?.question?.trim()) {
    const opts =
      poll.options?.map((o) => o.text).filter((t) => Boolean(t?.trim())) ?? [];
    return [poll.question, ...opts].join('\n');
  }
  const atts = message.value.attachments;
  if (atts?.length) {
    const urls = atts.map((a) => a.url).filter(Boolean);
    if (urls.length) return urls.join('\n');
  }
  const stickers = message.value.stickers;
  if (stickers?.length) {
    return stickers
      .map((sticker) => `:${sticker.name}: ${sticker.url}`)
      .join('\n');
  }
  return '';
}

async function copyMessage() {
  const text = messagePlainTextForCopy();
  if (!text) {
    dispatchAppToast('Nothing to copy', 'info');
    menuOpen.value = false;
    return;
  }
  const ok = await copyToClipboard(text);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

async function copyMessageImage() {
  const url = copyableMessageImageUrl.value;
  if (!url) {
    dispatchAppToast('No image to copy', 'info');
    menuOpen.value = false;
    return;
  }
  const ok = await copyImageFromUrl(url);
  menuOpen.value = false;
  if (ok) dispatchAppToast('Image copied', 'info');
  else dispatchAppToast('Could not copy image', 'warning');
}

async function copyRawMessage() {
  const mf = message.value.messageFormatVersion ?? 1;
  let raw: string;
  if (mf >= 2 && message.value.contentJson !== undefined) {
    raw = markdownFromEchoContentJson(message.value.contentJson).trim();
    if (!raw) {
      raw = (message.value.contentText ?? message.value.content ?? '').trim();
    }
  } else {
    raw = message.value.contentText ?? message.value.content ?? '';
  }
  if (!raw.trim()) {
    dispatchAppToast('Nothing to copy', 'info');
    menuOpen.value = false;
    return;
  }
  const ok = await copyToClipboard(raw);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

async function copyMessageLink() {
  const url = messageLink.value;
  if (!url.trim()) {
    dispatchAppToast('Nothing to copy', 'info');
    menuOpen.value = false;
    return;
  }
  const ok = await copyToClipboard(url);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

async function copyMessageId() {
  if (!message.value.id) return;
  const ok = await copyToClipboard(message.value.id);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

async function copyAuthorId() {
  const ok = await copyToClipboard(message.value.authorId);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

async function copyChannelIdFromMessage() {
  if (!props.channelId) return;
  const ok = await copyToClipboard(props.channelId);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

/** How the message menu was opened — drives expanded dev ID list on right-click. */
const contextMenuSource = ref<'rightclick' | 'ellipsis' | null>(null);

function onRootContextMenu(e: MouseEvent) {
  if (isSystemMessage.value) return;
  contextMenuSource.value = 'rightclick';
  openContextMenu(e);
}

function handleFocusIn() {
  focusWithin.value = true;
}

/**
 * The action bar is teleported to `body`, so focus can move between the bubble and
 * the bar without `relatedTarget` crossing `rootRef`. Re-sync from `activeElement`
 * after the browser finishes the focus move (also covers `relatedTarget === null`).
 */
function syncFocusWithinFromDom() {
  queueMicrotask(() => {
    const active = document.activeElement;
    focusWithin.value = Boolean(
      active instanceof Element &&
      (rootRef.value?.contains(active) ||
        floatingActionBarWrapRef.value?.contains(active)),
    );
  });
}

function handleFocusOutRoot() {
  syncFocusWithinFromDom();
}

function onRootMouseLeave(e: MouseEvent) {
  const next = e.relatedTarget as Node | null;
  if (next && floatingActionBarWrapRef.value?.contains(next)) return;
  hovered.value = false;
}

function onFloatingBarMouseLeave(e: MouseEvent) {
  const next = e.relatedTarget as Node | null;
  if (next && rootRef.value?.contains(next)) return;
  hovered.value = false;
  if (menuOpen.value || reactionPopoverOpen.value) return;
  blurFocusedMessageChrome();
  syncFocusWithinFromDom();
}

function toggleMenuFromEllipsis(e: MouseEvent) {
  contextMenuSource.value = 'ellipsis';
  void toggleMenu(e);
}

async function copyQuotedReplyMessageId() {
  const id = message.value.replyTo?.messageId;
  if (!id) return;
  const ok = await copyToClipboard(linkTokenMessage(id));
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

/** Right-click while dev IDs are enabled: full developer copy list in the context menu. */
const showExpandedDeveloperIds = computed(
  () => devModeIdsEnabled.value && contextMenuSource.value === 'rightclick',
);

function clearMessageActionBarVisibility() {
  hovered.value = false;
  focusWithin.value = false;
}

function blurFocusedMessageChrome() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (
    rootRef.value?.contains(active) ||
    floatingActionBarWrapRef.value?.contains(active)
  ) {
    active.blur();
  }
}

watch(
  () => message.value.editedAt ?? message.value.content,
  () => {
    clearMessageActionBarVisibility();
  },
);

const showActionBar = computed(
  () =>
    !isSystemMessage.value &&
    !throttleHeavyDescendants.value &&
    (hovered.value ||
      focusWithin.value ||
      menuOpen.value ||
      reactionPopoverOpen.value),
);

const { style: actionBarFloatingStyle } = useAnchoredFloatingPosition(
  rootRef,
  showActionBar,
);

function handleDelete() {
  if (message.value.id) emit('delete', message.value.id);
  menuOpen.value = false;
}

async function confirmModDeleteMessage() {
  if (!message.value.id || !showModActions.value) return;
  const ok = await requestAppConfirmFromContextMenu(
    () => {
      menuOpen.value = false;
    },
    {
      title: 'Delete this message?',
      confirmLabel: 'Delete',
      danger: true,
    },
  );
  if (!ok) return;
  emit('delete', message.value.id);
}

function emitModerate(
  action: 'kick' | 'ban' | 'timeout',
  timeoutMinutes?: number,
) {
  if (!showModActions.value) return;
  emit('moderateUser', {
    action,
    targetUserId: message.value.authorId,
    ...(timeoutMinutes !== undefined ? { timeoutMinutes } : {}),
  });
  menuOpen.value = false;
}

function handleReply() {
  emit('reply', message.value);
  menuOpen.value = false;
}

function handleEdit() {
  if (!message.value.id || !isOwnMessage.value) return;
  emit('edit', message.value);
  menuOpen.value = false;
}

function mentionAuthorFromMenu() {
  const fn = composerInsertUserMention?.value;
  if (!fn || isOwnMessage.value) return;
  fn({
    userId: message.value.authorId,
    displayName: authorLabel.value,
  });
  menuOpen.value = false;
}

function openAuthorProfileFromMenu() {
  const authorId = message.value.authorId;
  if (props.onOpenProfileFromContextMenu) {
    props.onOpenProfileFromContextMenu(authorId);
  } else {
    props.onOpenProfile?.(authorId, null);
  }
  menuOpen.value = false;
}

function messagePreviewForReport(): string {
  const m = message.value;
  if (m.contentJson != null) {
    try {
      return plainTextFromEchoContentJson(m.contentJson).trim();
    } catch {
      /* fall through */
    }
  }
  return (m.content ?? '').trim();
}

function openReportMessageFromMenu() {
  const channelId = props.channelId?.trim();
  const messageId = message.value.id?.trim();
  if (!channelId || !messageId || isOwnMessage.value) return;
  openReportModal({
    kind: 'message',
    messageId,
    channelId,
    authorId: message.value.authorId,
    authorDisplayName: authorLabel.value,
    preview: messagePreviewForReport(),
  });
  menuOpen.value = false;
}

async function copyAuthorUsername() {
  const name = message.value.author?.name?.trim() || authorLabel.value.trim();
  if (!name) {
    dispatchAppToast('Nothing to copy', 'info');
    menuOpen.value = false;
    return;
  }
  const ok = await copyToClipboard(name);
  menuOpen.value = false;
  if (!ok) dispatchAppToast('Could not copy to clipboard', 'warning');
}

function forwardMessageFromMenu() {
  props.onRequestForward?.(message.value);
  menuOpen.value = false;
}

function handleReact(emoji: string) {
  props.onReact?.(emoji);
  reactionPopoverOpen.value = false;
  clearMessageActionBarVisibility();
  blurFocusedMessageChrome();
}

function openAuthorProfile(event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement | null;
  const source = trigger?.classList.contains('author-name-trigger')
    ? 'chat-name'
    : 'chat-avatar';
  props.onOpenProfile?.(
    message.value.authorId,
    getPopoutAnchorRect(trigger, source),
  );
}

function handleQuickReact(emoji: string) {
  handleQuickReactCore(emoji, props.onReact);
  clearMessageActionBarVisibility();
  blurFocusedMessageChrome();
}

function jumpToQuotedMessage() {
  const targetId = message.value.replyTo?.messageId;
  const cid = props.channelId?.trim();
  if (!targetId || !cid) return;
  props.onGoToMessage?.(cid, targetId);
}

const {
  poppingEmojiKey,
  poppingQuickEmoji,
  resetForMessageChange,
  toggleMenu,
  openContextMenu,
  handleQuickReact: handleQuickReactCore,
  handleContentInteraction,
} = useMessageBubbleUi({
  message,
  menuOpen,
  menuRef,
  triggerRef,
  setMenuPositionFromRect,
  setMenuPositionFromPoint,
  fitMenuToViewport,
  reactTriggerRef,
  onGoToChannel: props.onGoToChannel,
  onOpenProfile: props.onOpenProfile,
});

function openReactionPopoverWrapper(ev?: MouseEvent) {
  const rect =
    ev?.currentTarget instanceof HTMLElement
      ? ev.currentTarget.getBoundingClientRect()
      : (reactTriggerRef.value?.getBoundingClientRect() ?? null);
  reactionsRef.value?.openReactionPopover(rect);
}

watch(poppingEmojiKey, (val) => {
  reactionsRef.value?.setPoppingEmoji(val);
});

watch(
  () => message.value.id,
  () => {
    resetForMessageChange();
    reactionPopoverOpen.value = false;
    clearMessageActionBarVisibility();
  },
);
</script>

<template>
  <div
    v-if="row.showUnreadSeparatorBefore"
    class="message-list__unread-separator mx-1 mb-2 mt-1 flex items-center gap-3 px-2"
    :class="{
      'message-list__unread-separator--first': row.layout.isFirstInList,
    }"
    aria-label="First unread message"
  >
    <span class="h-px flex-1 bg-rose-400/45" aria-hidden="true" />
    <span
      class="shrink-0 rounded-full border border-rose-300/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200"
    >
      New
    </span>
    <span class="h-px flex-1 bg-rose-400/45" aria-hidden="true" />
  </div>
  <div
    v-if="row.showDaySeparatorBefore"
    class="message-list__day-separator flex items-center gap-3 px-4"
    :class="{ 'message-list__day-separator--first': row.layout.isFirstInList }"
    :data-day="row.daySeparatorLabel"
  >
    <span class="h-px flex-1 bg-glass-2" aria-hidden="true" />
    <span
      class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted"
    >
      {{ row.daySeparatorLabel }}
    </span>
    <span class="h-px flex-1 bg-glass-2" aria-hidden="true" />
  </div>
  <article
    ref="rootRef"
    :id="message.id ? `message-${message.id}` : undefined"
    :aria-label="bubbleAriaLabel"
    class="message-bubble group relative px-1 rounded transition-colors hover:bg-glass-1"
    :class="[
      continuationLayout ? 'msg-continuation' : 'msg-header',
      {
        'msg-header--first': showAvatarResolved && row.layout.isFirstInList,
        'msg-header--clustered':
          showAvatarResolved && row.layout.groupedWithNext,
        'msg-continuation--followed':
          continuationLayout && row.layout.groupedWithNext,
        'msg-bubble--last': row.layout.isLastInList,
        'message-bubble--compact-top': row.isCompact,
        'bg-glass-1': menuOpen,
        'reply-message': message.replyTo,
        'message-mentioned': shouldHighlightMention,
        'message-bubble--unread': row.readState === 'unread',
        'message-bubble--send-pending': isSendPending,
      },
    ]"
    @contextmenu="onRootContextMenu"
    @mouseenter="hovered = true"
    @mouseleave="onRootMouseLeave"
    @focusin="handleFocusIn"
    @focusout="handleFocusOutRoot"
  >
    <MessageContextMenu
      ref="contextMenuRef"
      v-if="showContextMenu"
      :message="message"
      :is-own-message="isOwnMessage"
      :show-mod-actions="showModActions"
      :show-expanded-developer-ids="showExpandedDeveloperIds"
      :show-open-profile="!!onOpenProfile"
      :show-report-message="!isOwnMessage && !!channelId?.trim()"
      :channel-id="channelId"
      :is-pinned="isPinned"
      :menu-position="menuPosition"
      :menu-open="menuOpen"
      :show-mention-author-in-composer="showMentionAuthorInComposer"
      :can-pin="!!onPin"
      :can-unpin="!!onUnpin"
      :show-forward="showForwardInMenu"
      :show-view-reactions="hasReactions"
      :show-copy-image="!!copyableMessageImageUrl"
      :timeout-active="authorTimeoutActive"
      @enter-edit-mode="handleEdit"
      @handle-delete="handleDelete"
      @copy-message="copyMessage"
      @copy-image="copyMessageImage"
      @copy-raw-message="copyRawMessage"
      @copy-message-link="copyMessageLink"
      @forward-message="forwardMessageFromMenu"
      @mention-author="mentionAuthorFromMenu"
      @copy-author-id="copyAuthorId"
      @copy-message-id="copyMessageId"
      @copy-quoted-reply-message-id="copyQuotedReplyMessageId"
      @copy-channel-id="copyChannelIdFromMessage"
      @open-author-profile="openAuthorProfileFromMenu"
      @report-message="openReportMessageFromMenu"
      @copy-author-username="copyAuthorUsername"
      @pin="onPin?.()"
      @unpin="onUnpin?.()"
      @confirm-mod-delete="confirmModDeleteMessage"
      @moderate="emitModerate"
      @view-reactions="handleViewReactionsFromMenu"
      @close="menuOpen = false"
    />

    <div
      v-if="isSystemMessage && isDmCallRollupCollapseRow"
      class="py-1.5 flex flex-wrap items-center justify-center gap-2 text-xs"
    >
      <span class="leading-snug text-muted">{{
        message.contentText || message.content
      }}</span>
      <button
        type="button"
        class="chat-focus-ring shrink-0 rounded-md px-2 py-0.5 font-semibold text-accent hover:underline"
        @click="emitExpandDmCallRoll"
      >
        See more
      </button>
    </div>

    <div v-else-if="isSystemMessage" class="py-1.5">
      <p class="text-center text-xs leading-snug text-muted">
        {{ message.contentText || message.content }}
      </p>
    </div>

    <div v-else class="flex items-start gap-4">
      <!-- Avatar (header) or hover timestamp gutter (continuation) -->
      <button
        v-if="showAvatarResolved"
        type="button"
        class="author-trigger shrink-0"
        data-dev-hit="author"
        @click="openAuthorProfile"
      >
        <div
          class="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
          :class="message.replyTo ? 'reply-avatar' : 'mt-1'"
        >
          <PausedGifAvatar
            :src="safeImageUrl(message.author.avatar)"
            :alt="authorLabel"
            :session-key="message.authorId"
            img-class="rounded-full object-cover"
          />
        </div>
      </button>
      <div
        v-else-if="showGutterHoverResolved"
        class="msg-gutter w-10 shrink-0 flex items-start justify-end"
        data-dev-hit="message"
      >
        <MessageSendPendingDots v-if="isSendPending" />
        <span
          v-else
          class="msg-hover-time text-[9px] tabular-nums leading-none text-muted opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 select-none whitespace-nowrap text-right"
        >
          {{ shortTime }}
        </span>
      </div>

      <div
        class="min-w-0 flex-1"
        :class="{ 'content-with-reply': message.replyTo }"
      >
        <div
          v-if="message.forwardedFrom"
          class="mb-2 rounded-md border border-border bg-scrim-1 px-2.5 py-2 text-sm"
        >
          <div
            class="text-[10px] font-semibold uppercase tracking-wide text-muted"
          >
            Forwarded
          </div>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="font-medium text-foreground">{{
              message.forwardedFrom.authorName
            }}</span>
            <button
              v-if="onGoToMessage"
              type="button"
              class="chat-focus-ring text-xs text-accent hover:underline"
              @click="
                onGoToMessage(
                  message.forwardedFrom!.channelId,
                  message.forwardedFrom!.messageId,
                )
              "
            >
              Jump to message
            </button>
          </div>
          <p
            class="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] leading-snug text-muted"
          >
            <MessagePreviewSnippet
              :content="message.forwardedFrom.contentPreview"
              :max-len="400"
            />
          </p>
        </div>

        <MessageReplyPreview
          :message="message"
          :reply-to-message="row.replyPreview"
          @scroll-to-quoted-message="jumpToQuotedMessage"
        />

        <MessageHeader
          v-if="showAvatarResolved"
          :message="message"
          :author-label="authorLabel"
          :show-timestamp="row.showHeaderTimestamp"
          :author-role-color="authorRoleColor"
          :author-offline="authorLooksOffline"
          :is-pinned="isPinned"
          :send-pending="isSendPending"
          :channel-id="channelId"
          @open-profile="openAuthorProfile"
        />

        <div ref="messageBubbleShellRef" data-dev-hit="message" class="min-w-0">
          <div
            v-if="showTextCaption"
            ref="messageContentRef"
            v-spoiler-reveal
            class="message-text message-content max-w-full text-fg"
            :class="{
              'mb-1': !row.layout.groupedWithNext,
              'message-text--emoji-only': isEmojiOnlyBody,
            }"
            @click="handleContentInteraction"
            @keydown.enter="handleContentInteraction"
            @keydown.space.prevent="handleContentInteraction"
          >
            <MessageBubbleInnerBody
              :body-mode="bodyRenderMode"
              :display-message-content="displayMessageContent"
              :mentions="message.mentions"
              :parse-id-resolvers="parseIdResolvers"
              :embeds="contentEmbedsForSegments"
              :content-json="message.contentJson"
              :on-jump-to-message="onGoToMessage"
              :custom-emoji-render-key="customEmojiRenderKey"
              :message-id="message.id"
              :magic-time="magicTimeContext"
              :can-fill-image-slots="canFillImageSlots"
              :image-slot-uploading="imageSlotUploading"
              :on-fill-image-slot="handleFillImageSlot"
            />
          </div>
          <MessageAttachments
            :message="message"
            :attachments="displayAttachments"
            :open-image-viewer="openImageViewer"
            :open-document-viewer="openDocumentViewer"
          />
          <MessageInlineGifEmbeds
            v-if="hasInlineGifEmbeds"
            :embeds="linkEmbedsForDisplay ?? []"
            :open-image-viewer="openImageViewer"
            :alt="message.content || 'GIF'"
          />
          <MessageLinkEmbeds
            v-if="linkEmbedsForLinkCards?.some((e) => !e.echoJump)"
            class="mt-2"
            :embeds="linkEmbedsForLinkCards"
          />
          <MessageDiscordComponents
            v-if="showStandaloneMessageComponents"
            :components="message.components"
            :message-flags="message.messageFlags"
          />
          <PollDisplay
            v-if="pollForDisplay"
            :poll="pollForDisplay"
            :message-id="message.id"
            :current-user-id="currentUserId"
            :current-user-display-name="currentUserName"
            :discord-synced="!!message.bridgeFromDiscord"
            :resolve-poll-voter-display="resolvePollVoterDisplay"
            :resolve-poll-voter-avatar="resolvePollVoterAvatar"
            @vote="onVote?.($event)"
          />
          <!-- Edited indicator for grouped messages -->
          <span
            v-if="showGutterHoverResolved && message.editedAt"
            class="text-xs italic transition-opacity ml-1 text-muted"
          >
            (edited)
          </span>
          <MessageReactions
            ref="reactionsRef"
            v-model:reaction-popover-open="reactionPopoverOpen"
            :message="message"
            :server-id="serverId"
            :channel-id="channelId"
            :current-user-id="currentUserId"
            :current-user-display-name="currentUserName"
            :resolve-reactor-display="resolvePollVoterDisplay"
            :resolve-reactor-avatar="resolvePollVoterAvatar"
            :on-react="handleReact"
          />
        </div>
      </div>
    </div>
    <input
      ref="imageSlotFileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="onImageSlotFileSelected"
    />
  </article>

  <MessageReactionsVotersModal
    v-model="reactionsVotersModalOpen"
    :reactions="message.reactions ?? []"
    :channel-id="channelId"
    :message-preview="messagePreviewForReactionsModal"
    :message-id="message.id"
    :current-user-id="currentUserId"
    :current-user-display-name="currentUserName"
    :resolve-poll-voter-display="resolvePollVoterDisplay"
    :resolve-poll-voter-avatar="resolvePollVoterAvatar"
    :parse-reaction-emoji="parseSingleEmojiForReactions"
  />

  <Teleport to="body">
    <div
      v-if="showActionBar"
      ref="floatingActionBarWrapRef"
      class="pointer-events-auto"
      :style="actionBarFloatingStyle"
      :data-floating-ui="`message-action:${message.id ?? ''}`"
      @mouseleave="onFloatingBarMouseLeave"
      @focusin="handleFocusIn"
      @focusout="handleFocusOutRoot"
    >
      <MessageActionBar
        ref="actionBarRef"
        floating
        :message="message"
        :is-own-message="isOwnMessage"
        :show-mod-actions="showModActions"
        :timeout-active="authorTimeoutActive"
        :shift-pressed="shiftPressed"
        :menu-open="menuOpen"
        :popping-quick-emoji="poppingQuickEmoji"
        :quick-reaction-row="quickReactionEmojis"
        :parse-single-emoji-for-reactions="parseSingleEmojiForReactions"
        @quick-react="handleQuickReact"
        @remove-quick-reaction-favorite="handleRemoveQuickReactionFavorite"
        @open-reaction-popover="openReactionPopoverWrapper"
        @reply="handleReply"
        @enter-edit-mode="handleEdit"
        @handle-delete="handleDelete"
        @confirm-mod-delete="confirmModDeleteMessage"
        @moderate="emitModerate"
        @toggle-menu="toggleMenuFromEllipsis"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '@/features/chat/styles/messageBubble.scss';
</style>
