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
  MessageAttachmentPayload,
  MessageWithAuthor,
} from '@shared/types';
import { mentionsUser, type IdTokenResolvers } from '@/composables/useMarkdown';
import { isEmojiOnlyUpTo12 } from '@/utils/emojiUtils';
import { parseSingleEmoji } from '@/utils/twemoji';
import { sanitizeEmojiImgHtmlForVHtml } from '@/utils/sanitizeEmojiImgHtmlForVHtml';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';
import { requestAppConfirm } from '@/utils/appDialogs';
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
import MessageAttachments from './MessageAttachments.vue';
import MessageReactions from './MessageReactions.vue';
import MessageHeader from './MessageHeader.vue';
import MessageReplyPreview from './MessageReplyPreview.vue';
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
import { markdownFromEchoContentJson } from '@/features/chat/editor/echoContentJsonMarkdown';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { linkTokenMessage } from '@/utils/idTokens';
import { useContextMenuPosition } from '@/features/chat/composables/useContextMenuPosition';
import { useMessageEditState } from '@/features/chat/composables/useMessageEditState';
import { usePendingMedia } from '@/composables/usePendingMedia';
import { uploadPendingMediaAsAttachments } from '@/composables/uploadPendingMediaAsAttachments';
import { defaultQuickReactionFavorites } from '@/composables/useReactionFavorites';
import { useMessageBubbleUi } from '@/features/chat/composables/useMessageBubbleUi';
import { useMessageKatexScrollbarReveal } from '@/features/chat/composables/useMessageKatexScrollbarReveal';
import { applyEmbedTitlesToMessageContent } from '@/utils/embedLinkLabels';
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
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { resolveGuildMemberDisplayName } from '@/utils/resolveGuildMemberDisplayName';

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
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  /** When set, used to show mod actions on others’ messages (server chat only). */
  canModerateAuthor?: (authorId: string) => boolean;
  /**
   * Persist edit (Echo live). When set, used instead of `saveEdit` emit so the parent’s
   * promise result can keep the editor open on failure.
   */
  saveMessageEdit?: (
    messageId: string,
    newContent: string,
    attachments?: MessageAttachmentPayload[],
  ) => boolean | Promise<boolean>;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
}>();

const emit = defineEmits<{
  saveEdit: [
    messageId: string,
    newContent: string,
    attachments?: MessageAttachmentPayload[],
  ];
  delete: [messageId: string];
  reply: [message: MessageWithAuthor & { channelName?: string }];
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

watch(
  () => contextMenuRef.value,
  async () => {
    await nextTick();
    const vm = contextMenuRef.value as null | {
      getMenuRootElement?: () => HTMLElement | null;
    };
    menuRef.value = vm?.getMenuRootElement?.() ?? null;
  },
  { flush: 'post', immediate: true },
);
const reactTriggerRef = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const {
  menuPosition,
  setMenuPositionFromRect,
  setMenuPositionFromPoint,
  fitMenuToViewport,
} = useContextMenuPosition();
const editTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editFormRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const reactionsRef = ref<InstanceType<typeof MessageReactions> | null>(null);
const hovered = ref(false);
const focusWithin = ref(false);

const activeEditInsert = inject<{ value: ((text: string) => void) | null }>(
  'activeEditInsert',
);
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

const REACTION_CUSTOM_EMOJI = /^<a?:([^:>]+):([\w.-]{1,128})>$/;

function escReactionAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseSingleEmojiForReactions(emoji: string): string {
  const m = emoji.trim().match(REACTION_CUSTOM_EMOJI);
  if (m) {
    const emojiId = m[2]!;
    const stored = customEmojiUrlById?.value?.get(emojiId);
    const url = stored ? safeCustomEmojiUrl(stored) : null;
    if (url) {
      const raw = `<img class="emoji custom-emoji" draggable="false" alt="${escReactionAttr(`:${m[1]}:`)}" src="${escReactionAttr(url)}"/>`;
      return sanitizeEmojiImgHtmlForVHtml(raw);
    }
    ensureCustomEmojiId?.(emojiId);
  }
  return parseSingleEmoji(emoji);
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
  const raw = message.value.content ?? '';
  if (message.value.mentions?.length) return raw;
  return applyEmbedTitlesToMessageContent(raw, message.value.embeds);
});

/** Message body root (markdown / JSON caption) — wires KaTeX overflow scrollbars. */
const messageContentRef = ref<HTMLElement | null>(null);

useMessageKatexScrollbarReveal(messageContentRef, () =>
  [
    displayMessageContent.value,
    customEmojiRenderKey.value,
    message.value.content ?? '',
    typeof message.value.contentJson === 'object' &&
    message.value.contentJson !== null
      ? JSON.stringify(message.value.contentJson)
      : String(message.value.contentJson ?? ''),
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

const reactionPopoverOpenFromReactions = computed(() => {
  const inst = reactionsRef.value as
    | { reactionPopoverOpen: { value: boolean } }
    | null
    | undefined;
  return inst?.reactionPopoverOpen?.value ?? false;
});

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

const isMentioned = computed(() =>
  mentionsUser(
    message.value.content,
    message.value.mentions,
    props.currentUserId,
    props.currentUserName,
  ),
);

const shouldHighlightMention = computed(() => {
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

const editAttachmentFileInputRef = ref<HTMLInputElement | null>(null);
const {
  pendingImages,
  pendingVideos,
  pendingAudios,
  pendingDocuments,
  pendingExternalImages,
  pendingGifs,
  addFiles,
  clearAll: clearPendingEditMedia,
} = usePendingMedia();

async function finalizeEditAttachments(): Promise<MessageAttachmentPayload[]> {
  const cid = props.channelId?.trim();
  if (!cid) return [];
  const n =
    pendingImages.value.length +
    pendingVideos.value.length +
    pendingAudios.value.length +
    pendingDocuments.value.length +
    pendingExternalImages.value.length +
    pendingGifs.value.length;
  if (n === 0) return [];
  try {
    const out = await uploadPendingMediaAsAttachments(
      cid,
      [...pendingImages.value],
      [...pendingVideos.value],
      [...pendingAudios.value],
      [...pendingDocuments.value],
      [...pendingExternalImages.value],
      [...pendingGifs.value],
    );
    clearPendingEditMedia();
    return out;
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not upload attachments',
      'warning',
    );
    throw e;
  }
}

function onEditAttachmentFilePick(e: Event) {
  const t = e.target as HTMLInputElement;
  const files = t.files;
  if (files?.length) addFiles(Array.from(files));
  t.value = '';
}

const pendingEditUploadCount = computed(
  () =>
    pendingImages.value.length +
    pendingVideos.value.length +
    pendingAudios.value.length +
    pendingDocuments.value.length +
    pendingExternalImages.value.length +
    pendingGifs.value.length,
);

const {
  isEditing,
  editDraft,
  editAttachments,
  removeEditAttachment,
  saveFeedback,
  enterEditMode,
  cancelEdit,
  saveEdit,
  onEditKeydown,
  onEditInput,
  insertAtEditTextarea,
} = useMessageEditState({
  message,
  isOwnMessage,
  menuOpen,
  rootRef,
  editTextareaRef,
  editFormRef,
  messageContentRef,
  activeEditInsert: activeEditInsert ?? undefined,
  finalizeAttachments: finalizeEditAttachments,
  onSave: async (messageId, content, attachments) => {
    emitDiagnostic({
      level: 'info',
      domain: 'chat',
      event: 'message_edit_ui_save',
      stage: 'attempt',
      context: {
        action: 'MessageBubble.onSave',
        channelId: props.channelId ?? '',
        messageId,
        bytes: content.length,
        detail: props.saveMessageEdit ? 'path=prop' : 'path=emit',
      },
    });
    if (props.saveMessageEdit) {
      try {
        const r = await Promise.resolve(
          props.saveMessageEdit(messageId, content, attachments),
        );
        if (r === false) {
          emitDiagnostic({
            level: 'warn',
            domain: 'chat',
            event: 'message_edit_ui_save',
            stage: 'fail',
            context: {
              action: 'MessageBubble.onSave',
              channelId: props.channelId ?? '',
              messageId,
              ok: false,
              reason: 'saveMessageEdit_returned_false',
            },
          });
        }
        return r !== false;
      } catch (e) {
        emitDiagnostic({
          level: 'error',
          domain: 'chat',
          event: 'message_edit_ui_save',
          stage: 'fail',
          context: {
            action: 'MessageBubble.onSave',
            channelId: props.channelId ?? '',
            messageId,
            ok: false,
            reason: 'saveMessageEdit_threw',
            detail: e instanceof Error ? e.message : String(e),
          },
          error:
            e instanceof Error
              ? { message: e.message, stack: e.stack }
              : { message: String(e) },
        });
        throw e;
      }
    }
    emit('saveEdit', messageId, content, attachments);
    return true;
  },
});

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

watch(isEditing, (editing, wasEditing) => {
  if (!editing) {
    clearPendingEditMedia();
    if (wasEditing) {
      clearMessageActionBarVisibility();
      blurFocusedMessageChrome();
    }
    return;
  }
  clearMessageActionBarVisibility();
});

watch(
  () => message.value.editedAt ?? message.value.content,
  () => {
    if (!isEditing.value) clearMessageActionBarVisibility();
  },
);

const showActionBar = computed(
  () =>
    !isSystemMessage.value &&
    !isEditing.value &&
    (hovered.value ||
      focusWithin.value ||
      menuOpen.value ||
      reactionPopoverOpenFromReactions.value),
);

const { style: actionBarFloatingStyle } = useAnchoredFloatingPosition(
  rootRef,
  showActionBar,
);

defineExpose({
  enterEditMode,
});

function handleDelete() {
  if (message.value.id) emit('delete', message.value.id);
  menuOpen.value = false;
}

async function confirmModDeleteMessage() {
  if (!message.value.id || !showModActions.value) return;
  const ok = await requestAppConfirm({
    title: 'Delete this message?',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  emit('delete', message.value.id);
  menuOpen.value = false;
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
  props.onOpenProfile?.(message.value.authorId, null);
  menuOpen.value = false;
}

async function copyAuthorUsername() {
  const name = authorLabel.value.trim();
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
  editFormRef,
  isEditing,
  cancelEdit,
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
    clearMessageActionBarVisibility();
  },
);
</script>

<template>
  <div
    v-if="row.showUnreadSeparatorBefore"
    class="message-list__unread-separator mx-1 mb-2 mt-1 flex items-center gap-3 px-2"
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
    class="message-list__day-separator flex items-center gap-3 px-4 py-2"
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
        'msg-bubble--last': row.layout.isLastInList,
        'message-bubble--compact-top': row.isCompact,
        'bg-glass-1': menuOpen,
        'reply-message': message.replyTo,
        'message-mentioned': shouldHighlightMention,
        'message-bubble--unread': row.readState === 'unread',
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
      @enter-edit-mode="enterEditMode"
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
            :img-class="
              authorLooksOffline
                ? 'rounded-full object-cover grayscale'
                : 'rounded-full object-cover'
            "
          />
        </div>
      </button>
      <div
        v-else-if="showGutterHoverResolved"
        class="msg-gutter w-10 shrink-0 flex items-start justify-end"
        data-dev-hit="message"
      >
        <span
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
            {{ message.forwardedFrom.contentPreview }}
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
          :save-feedback="saveFeedback"
          :channel-id="channelId"
          @open-profile="openAuthorProfile"
        />

        <div data-dev-hit="message" class="min-w-0">
          <!-- Edit mode -->
          <div
            v-if="isEditing && isOwnMessage"
            ref="editFormRef"
            class="edit-form message-text"
          >
            <textarea
              ref="editTextareaRef"
              v-model="editDraft"
              rows="1"
              placeholder="Edit message..."
              class="edit-textarea"
              spellcheck="true"
              @input="onEditInput"
              @keydown="onEditKeydown"
            />
            <input
              ref="editAttachmentFileInputRef"
              type="file"
              class="sr-only"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              @change="onEditAttachmentFilePick"
            />
            <div class="edit-form__attachments">
              <span
                class="text-[11px] font-semibold uppercase tracking-wide text-muted"
                >Attachments</span
              >
              <button
                type="button"
                class="chat-focus-ring rounded-md border border-border bg-glass-2 px-2 py-1 text-xs font-medium text-fg-soft hover:bg-glass-hover hover:text-fg"
                @click="editAttachmentFileInputRef?.click()"
              >
                Add files
              </button>
              <span v-if="pendingEditUploadCount > 0" class="text-xs text-muted"
                >{{ pendingEditUploadCount }} uploading…</span
              >
              <div class="flex w-full flex-wrap gap-1.5">
                <div
                  v-for="(att, idx) in editAttachments"
                  :key="`${att.url}-${idx}`"
                  class="inline-flex max-w-full items-center gap-1 rounded-md bg-glass-2 px-2 py-1 text-xs text-fg-soft"
                >
                  <span class="truncate">{{ att.filename || att.kind }}</span>
                  <button
                    type="button"
                    class="chat-focus-ring shrink-0 rounded px-1 text-muted hover:text-fg"
                    title="Remove attachment"
                    aria-label="Remove attachment"
                    @click="removeEditAttachment(idx)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
            <div
              class="edit-form__actions"
              role="group"
              aria-label="Edit message actions"
            >
              <button
                type="button"
                class="edit-form__btn edit-form__btn--secondary chat-focus-ring"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="button"
                class="edit-form__btn edit-form__btn--primary chat-focus-ring"
                @click="() => void saveEdit()"
              >
                Save
              </button>
            </div>
          </div>
          <template v-else>
            <div
              v-if="showTextCaption"
              ref="messageContentRef"
              v-spoiler-reveal
              class="message-text message-content mb-1 max-w-3xl text-fg"
              :class="{
                'message-text--emoji-only': isEmojiOnlyUpTo12(
                  message.content ?? '',
                ),
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
                :embeds="message.embeds"
                :on-jump-to-message="onGoToMessage"
                :custom-emoji-render-key="customEmojiRenderKey"
                :message-id="message.id"
                :magic-time="magicTimeContext"
              />
            </div>
            <MessageAttachments
              :message="message"
              :attachments="displayAttachments"
              :open-image-viewer="openImageViewer"
              :open-document-viewer="openDocumentViewer"
            />
            <MessageLinkEmbeds
              v-if="message.embeds?.some((e) => !e.echoJump)"
              class="mt-2"
              :embeds="message.embeds"
            />
            <PollDisplay
              v-if="pollForDisplay"
              :poll="pollForDisplay"
              :message-id="message.id"
              :current-user-id="currentUserId"
              :current-user-display-name="currentUserName"
              :resolve-poll-voter-display="resolvePollVoterDisplay"
              :resolve-poll-voter-avatar="resolvePollVoterAvatar"
              @vote="onVote?.($event)"
            />
            <!-- Edited indicator for grouped messages -->
            <span
              v-if="
                showGutterHoverResolved && (message.editedAt || saveFeedback)
              "
              class="text-xs italic transition-opacity ml-1"
              :class="saveFeedback ? 'text-emerald-400' : 'text-muted'"
            >
              {{ saveFeedback ? 'Saved' : '(edited)' }}
            </span>
            <MessageReactions
              ref="reactionsRef"
              :message="message"
              :server-id="serverId"
              :current-user-id="currentUserId"
              :current-user-display-name="currentUserName"
              :resolve-reactor-display="resolvePollVoterDisplay"
              :resolve-reactor-avatar="resolvePollVoterAvatar"
              :on-react="handleReact"
            />
          </template>
        </div>
      </div>
    </div>
  </article>

  <MessageReactionsVotersModal
    v-model="reactionsVotersModalOpen"
    :reactions="message.reactions ?? []"
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
        @enter-edit-mode="enterEditMode"
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
