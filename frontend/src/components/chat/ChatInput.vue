<script setup lang="ts">
import {
  ref,
  inject,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  computed,
  toRef,
  type ComputedRef,
  type Ref,
} from 'vue';
import { useServerEmojiLibrary } from '@/composables/useServerEmojiLibrary';
import type {
  MentionEntity,
  MentionKind,
  PollData,
  ReplyTo,
  EchoChannelType,
} from '@shared/types';
import { ECHO_CONTENT_SCHEMA_VERSION } from '@shared/echoMessageFormatV2';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import { useThemeStore } from '@/stores/theme';
import EmojiPopout from '@/components/chat/EmojiPopout.vue';
import GifPopout from '@/components/chat/GifPopout.vue';
import AttachPopout from '@/components/chat/AttachPopout.vue';
import PendingMediaPreview from '@/components/chat/PendingMediaPreview.vue';
import ImageViewerModal from '@/components/chat/ImageViewerModal.vue';
import type { ImageItem } from '@/components/chat/ImageViewerModal.vue';
import PollCreateModal from '@/components/chat/PollCreateModal.vue';
import ChatInputComposerBar from '@/features/chat/components/ChatInputComposerBar.vue';
import { applyComposerOrderedListEnter } from '@/features/chat/editor/composerMarkdownListEnter';
import { useComposerState } from '@/composables/useComposerState';
import {
  hasMarkdownSyntax,
  type IdTokenResolvers,
} from '@/composables/useMarkdown';
import {
  normalizeEchoMessageFormatTemplateInput,
  echoHardFormatPrefixSatisfied,
  stripLeadingDuplicateHardFormatTemplate,
} from '@shared/messageChunkLimits';
import { useDebouncedMarkdownPreviewHtml } from '@/features/chat/composables/useDebouncedMarkdownPreviewHtml';
import { useEmojiAutocomplete } from '@/composables/useEmojiAutocomplete';
import {
  useMentionAutocomplete,
  type MentionOption,
} from '@/composables/useMentionAutocomplete';
import { useChannelAutocomplete } from '@/composables/useChannelAutocomplete';
import { usePendingMedia } from '@/composables/usePendingMedia';
import { usePendingVideoEagerUpload } from '@/composables/usePendingVideoEagerUpload';
import { useChatSend } from '@/composables/useChatSend';
import { usePopoutStack } from '@/composables/usePopoutStack';
import { truncateForReply } from '@/features/chat/composables/useReplyPreview';
import { ECHO_CHAT_COMPOSER_FOCUS_EVENT } from '@/utils/controllerMissingAction';
import { extractMediaFilesFromClipboard } from '@/features/chat/composables/useClipboardMedia';
import { useChatInputSelectionMenu } from '@/features/chat/composables/useChatInputSelectionMenu';
import { useChatInputMarkdownPreview } from '@/features/chat/composables/useChatInputMarkdownPreview';
import {
  markdownWrapDelimiters,
  resolveMarkdownComposerKeybind,
} from '@/features/chat/composables/markdownComposerKeybinds';
import {
  readMarkdownPreviewModePreference,
  writeMarkdownPreviewModePreference,
  normalizeMarkdownPreviewModeForShipping,
  type MarkdownPreviewMenuMode,
} from '@/features/chat/composables/markdownPreviewModePreference';
import {
  useChatPermissions,
  type OutgoingContentType,
} from '@/composables/useChatPermissions';
import { isEmojiOnlyUpTo12 } from '@/utils/emojiUtils';
import type {
  InsertUserMentionFn,
  InsertUserMentionPayload,
} from '@/features/chat/chatComposerContext';
import { insertUserMentionAtCursor as insertUserMentionAtCursorShared } from '@/features/chat/composables/insertUserMentionAtCursor';
import { shiftMentionsForReplacement } from '@/features/chat/editor/composerModel';

import { useChatInputSlowmode } from '@/features/chat/composables/useChatInputSlowmode';
import { useChatTypingComposer } from '@/features/chat/composables/useChatTypingComposer';
import ChatInputMarkdownPreview from '@/features/chat/components/ChatInputMarkdownPreview.vue';
import { useCompactShell } from '@/composables/useCompactShell';
import {
  clearComposerDraft,
  isComposerDraftEmpty,
  readComposerDraft,
  writeComposerDraft,
} from '@/features/chat/composables/composerDraftStorage';

const props = defineProps<
  {
    channelName: string;
    placeholder?: string;
    popoutDirection?: 'up' | 'down';
    popoutTheme?: 'default' | 'forum';
    channelId: string;
    serverId?: string;
    users?: {
      id: string;
      name: string;
      pfp: string;
      status?: string;
      username?: string;
      nickname?: string;
    }[];
    /** When set, `@` suggestions use this list instead of `users`. */
    mentionUsers?: {
      id: string;
      name: string;
      pfp: string;
      status?: string;
      username?: string;
      nickname?: string;
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
      mentions?: MentionEntity[],
      imageUrl?: string,
      poll?: PollData,
      gif?: boolean,
      replyTo?: ReplyTo,
      imageSpoiler?: boolean,
      videoUrl?: string,
      attachments?: import('@shared/types').MessageAttachmentPayload[],
      contentJson?: unknown,
      contentSchemaVersion?: number,
      forwardMessageId?: string,
      forwardPreview?: import('@shared/types').ForwardedFrom,
      stickerIds?: string[],
      stickerPreview?: import('@shared/types').MessageStickerPayload,
    ) => void;
    replyingTo?: ReplyTo | null;
  } & {
    slowmodeInterval?: number;
    lastOwnMessageAt?: string | null;
    /** When provided, ArrowUp on an empty composer edits the last message you sent in this channel. */
    requestEditLastMessage?: () => boolean | Promise<boolean>;
    /** Registers `insertUserMentionAtCursor` with the layout so context menus can mention into this composer. */
    registerInsertUserMention?: (fn: InsertUserMentionFn | null) => void;
    /** Keywords from recent channel messages to seed the GIF popout “Images” tab. */
    gifPopoutSeedKeywords?: string[];
    /** Text/forum: default message prefix from channel settings. */
    messageFormatTemplate?: string;
    /** When true with non-empty template, prefix is locked and required for text sends. */
    messageFormatHard?: boolean;
  }
>();

const {
  slowmodeInterval,
  lastOwnMessageAt,
  slowmodeActive,
  slowmodeRemainingSeconds,
  slowmodeProgressPercent,
} = useChatInputSlowmode(props);

const { isCompactShell } = useCompactShell();

const themeStore = useThemeStore();
const { canonicalTheme } = storeToRefs(themeStore);

const composerToolbarIcons = computed(() => ({
  gif: canonicalTheme.value === 'light' ? icons.gifLight : icons.gif,
  emotes: canonicalTheme.value === 'light' ? icons.emotesLight : icons.emotes,
}));

const { getSendState, assertCanSend } = useChatPermissions();

const composerCanSendText = computed(
  () =>
    getSendState({
      channelId: props.channelId,
      contentTypes: ['text'],
      context: composerSource,
    }).allowed,
);

const showSlowmodeOverlay = computed(
  () => slowmodeActive.value && !composerCanSendText.value,
);

const composerSource = { source: 'composer' as const };

const composerSendState = computed(() =>
  getSendState({
    channelId: props.channelId,
    contentTypes: ['text'],
    context: composerSource,
  }),
);

/** Strict path: no permission props via ChatView — `getSendState` only (no parallel boolean flags). */
const composerDisabled = computed(() => !composerSendState.value.allowed);
const composerDisabledReason = computed(
  () => composerSendState.value.blockReason ?? '',
);
const communicationTimeoutActive = computed(
  () => composerSendState.value.blockKind === 'timeout',
);
const communicationTimeoutUntilEpochMs = computed(
  () => composerSendState.value.communicationTimeoutUntilEpochMs ?? null,
);
const communicationTimeoutNowMs = ref(Date.now());

const communicationTimeoutRemainingSeconds = computed(() => {
  const epochMs = communicationTimeoutUntilEpochMs.value;
  if (!communicationTimeoutActive.value || !epochMs) return 0;
  return Math.max(
    0,
    Math.ceil((epochMs - communicationTimeoutNowMs.value) / 1000),
  );
});

function formatTimeoutCountdown(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const communicationTimeoutCountdownLabel = computed(() =>
  formatTimeoutCountdown(communicationTimeoutRemainingSeconds.value),
);
const communicationTimeoutLockTitle = computed(() =>
  communicationTimeoutActive.value
    ? 'Communication timeout active'
    : 'Message input locked',
);
const communicationTimeoutLockDetail = computed(() => {
  if (!communicationTimeoutActive.value) return permissionLockMessage.value;
  const countdown = communicationTimeoutCountdownLabel.value;
  return countdown
    ? `You are in a communication timeout in this server. You can chat again in ${countdown}.`
    : 'You are in a communication timeout in this server.';
});

const composerBarDisabled = computed(() => composerDisabled.value);
const composerBarDisabledReason = computed(() => composerDisabledReason.value);

/** Full replacement of the composer (like slowmode) when send is blocked by permissions. */
const showPermissionLockOverlay = computed(
  () => composerDisabled.value && !showSlowmodeOverlay.value,
);

const permissionLockMessage = computed(
  () =>
    composerDisabledReason.value.trim() ||
    'You do not have permission to send messages in this channel.',
);
let communicationTimeoutTicker: ReturnType<typeof setInterval> | null = null;

watch(
  communicationTimeoutActive,
  (active) => {
    if (communicationTimeoutTicker) {
      clearInterval(communicationTimeoutTicker);
      communicationTimeoutTicker = null;
    }
    if (!active) return;
    communicationTimeoutNowMs.value = Date.now();
    communicationTimeoutTicker = setInterval(() => {
      communicationTimeoutNowMs.value = Date.now();
    }, 1000);
  },
  { immediate: true },
);
const canOpenAttach = computed(() => {
  const poll = getSendState({
    channelId: props.channelId,
    contentTypes: ['poll'],
    context: composerSource,
  });
  const media = getSendState({
    channelId: props.channelId,
    contentTypes: ['media'],
    context: composerSource,
  });
  return poll.allowed || media.allowed;
});
const attachAllowsUpload = computed(
  () =>
    getSendState({
      channelId: props.channelId,
      contentTypes: ['media'],
      context: composerSource,
    }).allowed,
);
const attachAllowsPoll = computed(
  () =>
    getSendState({
      channelId: props.channelId,
      contentTypes: ['poll'],
      context: composerSource,
    }).allowed,
);

function isMediaSendBlocked(): boolean {
  return !getSendState({
    channelId: props.channelId,
    contentTypes: ['media'],
    context: composerSource,
  }).allowed;
}

function isPollSendBlocked(): boolean {
  return !getSendState({
    channelId: props.channelId,
    contentTypes: ['poll'],
    context: composerSource,
  }).allowed;
}

const emit = defineEmits<{
  'clear-reply': [];
}>();

const sendError = ref<string | null>(null);

const COMPOSER_DRAFT_SAVE_DEBOUNCE_MS = 400;
let composerDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;

function persistComposerDraftForChannel(channelId: string) {
  const id = channelId.trim();
  if (!id) return;
  const snapshot = composer.captureSnapshot();
  if (isComposerDraftEmpty(snapshot)) {
    clearComposerDraft(id);
    return;
  }
  writeComposerDraft(id, snapshot);
}

function schedulePersistComposerDraft() {
  if (composerDraftSaveTimer != null) clearTimeout(composerDraftSaveTimer);
  composerDraftSaveTimer = setTimeout(() => {
    composerDraftSaveTimer = null;
    persistComposerDraftForChannel(props.channelId);
  }, COMPOSER_DRAFT_SAVE_DEBOUNCE_MS);
}

function restoreComposerDraftForChannel(channelId: string) {
  const draft = readComposerDraft(channelId);
  composer.clear();
  if (!draft || isComposerDraftEmpty(draft)) {
    void nextTick(() => applyChannelMessageFormatAfterRestore());
    return;
  }
  composer.restoreSnapshot(draft);
  void nextTick(() => applyChannelMessageFormatAfterRestore());
}

function formatComposerError(raw: string | null): string {
  if (!raw) return '';
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    /\b429\b/.test(t) ||
    lower.includes('retry-after')
  ) {
    return 'You’re sending messages too quickly. Wait a moment and try again.';
  }
  if (lower.includes('slowmode')) {
    return 'Slowmode is active in this channel. Wait before sending another message.';
  }
  if (lower.includes('communication timeout') || lower.includes('timed out')) {
    return 'You are in a communication timeout in this server.';
  }
  if (t.length > 220) {
    return `${t.slice(0, 200).trim()}…`;
  }
  return t;
}

const displaySendError = computed(() => formatComposerError(sendError.value));

function dismissSendError() {
  sendError.value = null;
}

const pollModalOpen = ref(false);
const markdownPreviewOpen = ref(false);
const markdownPreviewInline = ref(false);
const markdownPreviewState = inject<
  Ref<{ html: string; expanded: boolean }> | undefined
>('markdownPreviewState', undefined);
const keepLatestMessageVisible = inject<
  ((smooth?: boolean, force?: boolean) => void) | undefined
>('keepLatestMessageVisible', undefined);
const idTokenResolvers = inject<
  ComputedRef<IdTokenResolvers | undefined> | undefined
>('idTokenResolvers', undefined);
const parseIdResolvers = computed(() => idTokenResolvers?.value);

const composer = useComposerState(parseIdResolvers);
/** Top-level ref so the template unwraps it; nested `composer.editor` would pass the Ref object to EditorContent and crash. */
const tiptapEditor = composer.editor;
const composerContent = composer.content;
useChatTypingComposer({
  channelId: toRef(props, 'channelId'),
  content: composer.content,
  enabled: computed(() => !!props.sendMessage && !composerBarDisabled.value),
});
const composerEmojiOnly = computed(() =>
  isEmojiOnlyUpTo12(composer.content.value),
);
const composerSurfaceRef = composer.surfaceRef;
const markdownPreviewExpanded = computed(
  () => markdownPreviewState?.value?.expanded ?? false,
);

const messageFormatNormalized = computed(() =>
  typeof props.messageFormatTemplate === 'string'
    ? normalizeEchoMessageFormatTemplateInput(props.messageFormatTemplate)
    : '',
);

const messageFormatPrefixLen = computed(() =>
  props.messageFormatHard === true && messageFormatNormalized.value.length > 0
    ? messageFormatNormalized.value.length
    : 0,
);

function shiftMentionEntities(
  mentions: MentionEntity[],
  delta: number,
): MentionEntity[] {
  if (delta === 0) return mentions.map((m) => ({ ...m }));
  return mentions.map((m) => ({
    ...m,
    start: m.start + delta,
    end: m.end + delta,
  }));
}

function ensureComposerHardFormatPrefix() {
  const T = messageFormatNormalized.value;
  if (!T || props.messageFormatHard !== true) return;

  for (let k = 0; k < 8; k++) {
    const cur = composer.content.value;
    const stripped = stripLeadingDuplicateHardFormatTemplate(cur, T);
    if (stripped === null || stripped === cur) break;
    const lo = T.length;
    const hi = T.length * 2;
    const delta = lo - hi;
    const mentions = shiftMentionsForReplacement(
      cur,
      composer.mentions.value,
      lo,
      hi,
      0,
    );
    const shiftPos = (p: number) => {
      if (p <= lo) return p;
      if (p >= hi) return p + delta;
      return lo;
    };
    let a = shiftPos(composer.getSelectionStart());
    let b = shiftPos(composer.getSelectionEnd());
    if (b < a) b = a;
    composer.setSerializedState(stripped, mentions, a, b);
  }

  const cur = composer.content.value;
  if (echoHardFormatPrefixSatisfied(cur, T)) return;
  const next = T + cur;
  const m = shiftMentionEntities(composer.mentions.value, T.length);
  const pos = Math.min(composer.getSelectionStart() + T.length, next.length);
  composer.setSerializedState(next, m, pos, pos);
}

function ensureComposerSoftFormatIfEmpty() {
  const T = messageFormatNormalized.value;
  if (!T || props.messageFormatHard === true) return;
  if (composer.content.value.trim().length > 0) return;
  composer.setSerializedState(T, [], T.length, T.length);
}

function applyChannelMessageFormatAfterRestore() {
  ensureComposerHardFormatPrefix();
  ensureComposerSoftFormatIfEmpty();
}

const markdownPreviewRef = ref<{
  markdownPreviewContentRef: HTMLDivElement | null;
} | null>(null);
const selectionMenuRef = ref<HTMLElement | null>(null);
const composerUiRefs = { surface: composer.surfaceRef, menu: selectionMenuRef };

const { send } = useChatSend(props.sendMessage);
const {
  pendingImages,
  pendingVideos,
  pendingAudios,
  pendingDocuments,
  pendingGifs,
  pendingExternalImages,
  addFiles,
  addGif,
  addExternalImageUrl,
  toggleAllSpoilers,
  allSpoilers,
  removeImage,
  removeVideo,
  removeAudio,
  removeDocument,
  removeGif,
  removeExternalImage,
  clearAll: clearPendingMedia,
} = usePendingMedia();

usePendingVideoEagerUpload(
  computed(() => props.channelId),
  pendingVideos,
);

const pendingImageViewerOpen = ref(false);
const pendingImageViewerIndex = ref(0);

const pendingImageViewerItems = computed<ImageItem[]>(() =>
  pendingImages.value.map((p) => ({
    url: p.url,
    isGif: p.file.type === 'image/gif',
  })),
);

watch(
  () => pendingImages.value.length,
  (len) => {
    if (len === 0) pendingImageViewerOpen.value = false;
  },
);

function openPendingImagePreview(startIndex = 0) {
  const n = pendingImages.value.length;
  if (!n) return;
  pendingImageViewerIndex.value = Math.max(0, Math.min(startIndex, n - 1));
  pendingImageViewerOpen.value = true;
}

const {
  activePopout,
  wrapperRef,
  toggle: togglePopout,
  close: closePopout,
} = usePopoutStack();

const composerBarRef = ref<InstanceType<typeof ChatInputComposerBar> | null>(
  null,
);
const gifPopoutAnchorEl = computed(
  () => composerBarRef.value?.gifPopoutAnchorRef ?? null,
);

const serverEmojiLibrary = useServerEmojiLibrary(
  computed(() => props.serverId),
);

const composerCustomEmojiAllowed = computed(
  () =>
    getSendState({
      channelId: props.channelId,
      contentTypes: ['externalEmoji'],
      context: composerSource,
    }).allowed,
);

const emojiAutocomplete = useEmojiAutocomplete(
  () => composer.content.value,
  () => composer.getSelectionStart(),
  composer.replaceRange,
  {
    getCustomEmojiEntries: () =>
      composerCustomEmojiAllowed.value
        ? serverEmojiLibrary.flatCustomEmojis.value
        : [],
  },
);

const mentionAutocompleteOptions = computed<MentionOption[]>(() =>
  (props.mentionUsers ?? props.users ?? []).map((u) => {
    const aliases = [u.nickname, u.username, u.name]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x, idx, arr) => !!x && arr.indexOf(x) === idx);
    return {
      id: u.id,
      name: u.name,
      aliases,
      avatar: u.pfp,
      status: u.status,
      kind: 'user' as const,
    };
  }),
);

function toMentionKind(option: MentionOption): MentionKind {
  if (option.kind) return option.kind;
  if (option.id === '__everyone__') return 'everyone';
  if (option.id === '__active__') return 'active';
  return 'user';
}

const mentionAutocomplete = useMentionAutocomplete(
  () => composer.getContent(),
  () => composer.getSelectionStart(),
  (start, end, option) =>
    composer.insertMention(start, end, {
      kind: toMentionKind(option),
      label: option.name,
      ...(toMentionKind(option) === 'user' ? { userId: option.id } : {}),
    }),
  mentionAutocompleteOptions,
  computed(
    () =>
      getSendState({
        channelId: props.channelId,
        contentTypes: ['massMention'],
        context: composerSource,
      }).allowed,
  ),
  () => composer.mentions.value,
);

const channelOptions = computed(() => props.channels ?? []);
const channelAutocomplete = useChannelAutocomplete(
  () => composer.getContent(),
  () => composer.getSelectionStart(),
  (start, end, option) => composer.insertChannelMention(start, end, option),
  channelOptions,
  () => composer.mentions.value,
);

const showMentionAutocomplete = computed(
  () => chatInputFocused.value && mentionAutocomplete.showPopup.value,
);

const showChannelAutocomplete = computed(
  () => chatInputFocused.value && channelAutocomplete.showPopup.value,
);

const showEmojiAutocomplete = computed(
  () => chatInputFocused.value && emojiAutocomplete.showPopup.value,
);
const showMarkdownPreviewToggle = computed(() =>
  hasMarkdownSyntax(composer.content.value),
);
const hasComposerContent = computed(
  () => composer.content.value.trim().length > 0,
);

/** Compact shell: enable the tap-to-send control when there is text, pending media, or an active reply. */
const hasComposerPayload = computed(() => {
  if (composer.content.value.trim().length > 0) return true;
  if (props.replyingTo) return true;
  return (
    pendingImages.value.length > 0 ||
    pendingVideos.value.length > 0 ||
    pendingAudios.value.length > 0 ||
    pendingDocuments.value.length > 0 ||
    pendingExternalImages.value.length > 0 ||
    pendingGifs.value.length > 0
  );
});
const markdownPreviewHtml = useDebouncedMarkdownPreviewHtml({
  content: composer.content,
  mentions: composer.mentions,
  parseIdResolvers,
  previewOpen: markdownPreviewOpen,
  previewInline: markdownPreviewInline,
  previewExpanded: markdownPreviewExpanded,
});

const {
  syncPreviewScrollWithTextarea: syncPreviewScrollWithTextareaCore,
  expandMarkdownPreview: expandMarkdownPreviewCore,
} = useChatInputMarkdownPreview({
  markdownPreviewState,
  markdownPreviewHtml,
  showMarkdownPreviewToggle,
  hasComposerContent,
  markdownPreviewExpanded,
  markdownPreviewOpen,
  markdownPreviewInline,
  composerScrollRef: composerSurfaceRef,
  markdownPreviewContentRef: computed(
    () => markdownPreviewRef.value?.markdownPreviewContentRef ?? null,
  ),
  keepLatestMessageVisible,
});

watch(
  markdownPreviewInline,
  (inline) => {
    composer.setMarkdownDecorationsEnabled(inline);
  },
  { immediate: true },
);

const composerPlaceholder = computed(() => {
  if (
    pendingImages.value.length ||
    pendingVideos.value.length ||
    pendingAudios.value.length ||
    pendingDocuments.value.length ||
    pendingExternalImages.value.length ||
    pendingGifs.value.length
  )
    return 'Add a caption...';
  const p =
    typeof props.placeholder === 'string' ? props.placeholder.trim() : '';
  return p || `Message ${props.channelName}`;
});
const fileInputRef = ref<HTMLInputElement | null>(null);
const chatInputFocused = ref(false);

watch(chatInputFocused, (focused) => {
  window.dispatchEvent(
    new CustomEvent(ECHO_CHAT_COMPOSER_FOCUS_EVENT, {
      detail: { focused },
    }),
  );
});

const activeEditInsert = inject<{ value: ((text: string) => void) | null }>(
  'activeEditInsert',
);

const CUSTOM_EMOJI_INSERT = /^<a?:[^:>]+:\d+>$/;

function insertEmoji(emoji: string) {
  const t = emoji.trim();
  if (CUSTOM_EMOJI_INSERT.test(t)) {
    const ext = getSendState({
      channelId: props.channelId,
      contentTypes: ['externalEmoji'],
      context: composerSource,
    });
    if (!ext.allowed) {
      sendError.value = ext.blockReason ?? 'You cannot use custom emoji here.';
      closePopout();
      return;
    }
  }
  const insert = activeEditInsert?.value;
  if (insert) {
    insert(emoji);
  } else {
    composer.focus();
    composer.insertText(emoji);
  }
  closePopout();
}

function insertGif(url: string) {
  if (isMediaSendBlocked()) return;
  addGif(url);
  composer.focus();
  closePopout();
}

function insertImageFromSearch(url: string) {
  if (isMediaSendBlocked()) return;
  addExternalImageUrl(url);
  composer.focus();
  closePopout();
}

function sendSticker(
  stickerId: string,
  preview?: import('@shared/types').MessageStickerPayload,
) {
  if (!props.sendMessage) return;
  if (isMediaSendBlocked()) return;
  try {
    assertCanSend({
      channelId: props.channelId,
      contentTypes: ['media'],
      context: composerSource,
    });
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Send blocked';
    closePopout();
    return;
  }
  sendError.value = null;
  props.sendMessage(
    props.channelId,
    '',
    [],
    undefined,
    undefined,
    undefined,
    props.replyingTo ?? undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [stickerId],
    preview,
  );
  emit('clear-reply');
  closePopout();
}

function handleUploadClick() {
  if (composerBarDisabled.value || isMediaSendBlocked()) return;
  fileInputRef.value?.click();
  closePopout();
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files?.length) {
    target.value = '';
    return;
  }
  if (isMediaSendBlocked()) {
    target.value = '';
    return;
  }
  addFiles(Array.from(files), props.channelId);
  target.value = '';
}

function handlePaste(e: ClipboardEvent) {
  const files = extractMediaFilesFromClipboard(e);
  if (files.length > 0) {
    if (isMediaSendBlocked()) return;
    e.preventDefault();
    addFiles(files, props.channelId);
  }
}

function handleCreatePoll() {
  if (composerBarDisabled.value || isPollSendBlocked()) return;
  pollModalOpen.value = true;
  closePopout();
}

function handlePollCreate(poll: PollData) {
  props.sendMessage?.(
    props.channelId,
    '',
    [],
    undefined,
    poll,
    undefined,
    props.replyingTo ?? undefined,
  );
  emit('clear-reply');
}

function refreshAutocomplete() {
  nextTick(() => {
    const text = composer.getContent();
    const cursor = composer.getSelectionStart();
    /** Skip autocomplete scans when no trigger character is near the caret. */
    const before = text.slice(Math.max(0, cursor - 48), cursor);
    const mayTrigger =
      /[@#:]/.test(before) ||
      emojiAutocomplete.showPopup.value ||
      mentionAutocomplete.showPopup.value ||
      channelAutocomplete.showPopup.value;
    if (!mayTrigger) {
      if (emojiAutocomplete.showPopup.value) emojiAutocomplete.close();
      if (mentionAutocomplete.showPopup.value) mentionAutocomplete.close();
      if (channelAutocomplete.showPopup.value) channelAutocomplete.close();
      return;
    }
    emojiAutocomplete.updateFromInput();
    mentionAutocomplete.updateFromInput();
    channelAutocomplete.updateFromInput();
  });
}

function applyComposerMarkdownShortcut(prefix: string, suffix: string) {
  const start = composer.getSelectionStart();
  const end = composer.getSelectionEnd();
  if (start !== end) {
    composer.wrapSelection(prefix, suffix);
    return;
  }
  const inserted = `${prefix}${suffix}`;
  composer.replaceRange(start, end, inserted);
  const mid = start + prefix.length;
  composer.setSelection(mid, mid);
}

function insertUserMentionAtCursor(payload: InsertUserMentionPayload) {
  insertUserMentionAtCursorShared(
    {
      focus: composer.focus,
      getSelectionStart: composer.getSelectionStart,
      getSelectionEnd: composer.getSelectionEnd,
      insertText: composer.insertText,
      insertMention: composer.insertMention,
      getContent: composer.getContent,
    },
    payload,
    {
      canInsert: () => !composerBarDisabled.value,
      schedule: (fn) => {
        void nextTick(fn);
      },
      onInserted: refreshAutocomplete,
    },
  );
}

function handleInputFocus() {
  chatInputFocused.value = true;
  closePopout();
  emojiAutocomplete.close();
  mentionAutocomplete.close();
  channelAutocomplete.close();
}

function handleInputBlur(e: FocusEvent) {
  const root = composerSurfaceRef.value;
  const menu = selectionMenuRef.value;
  const next = e.relatedTarget;
  if (root && next instanceof Node && root.contains(next)) {
    return;
  }
  if (menu && next instanceof Node && menu.contains(next)) {
    return;
  }
  chatInputFocused.value = false;
  hideSelectionMenu();
  emojiAutocomplete.close();
  mentionAutocomplete.close();
  channelAutocomplete.close();
  void nextTick(() => ensureComposerHardFormatPrefix());
}

function syncPreviewScrollWithTextarea() {
  syncPreviewScrollWithTextareaCore();
}

function handleComposerScroll() {
  syncPreviewScrollWithTextarea();
  if (showSelectionMenu.value) nextTick(updateSelectionMenuPosition);
}

function handleComposerPointerDown() {
  closePopout();
}

function hideSelectionMenu() {
  hideSelectionMenuCore();
}

/** While IME composition is active, avoid custom key handling / preventDefault — iOS/iPadOS predictive text and CJK keyboards rely on it. */
function isImeComposingKeyboardEvent(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  // WebKit sometimes emits keyCode 229 for in-flight IME without `isComposing` on keydown.
  return e.keyCode === 229;
}

function handleKeydown(e: KeyboardEvent): boolean {
  if (isImeComposingKeyboardEvent(e)) return false;
  const plen = messageFormatPrefixLen.value;
  if (plen > 0 && (e.key === 'Backspace' || e.key === 'Delete')) {
    composer.flushComposerSync();
    const a = composer.getSelectionStart();
    const b = composer.getSelectionEnd();
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi <= plen) {
      e.preventDefault();
      return true;
    }
    if (lo < plen) {
      e.preventDefault();
      composer.replaceRange(plen, hi, '');
      return true;
    }
  }
  if (
    e.key === 'ArrowUp' &&
    !e.shiftKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey
  ) {
    const emptyComposer = composer.content.value.trim().length === 0;
    const noPendingMedia =
      pendingImages.value.length === 0 &&
      pendingVideos.value.length === 0 &&
      pendingAudios.value.length === 0 &&
      pendingDocuments.value.length === 0 &&
      pendingExternalImages.value.length === 0 &&
      pendingGifs.value.length === 0;
    if (emptyComposer && noPendingMedia && props.requestEditLastMessage) {
      e.preventDefault();
      void Promise.resolve(props.requestEditLastMessage());
      return true;
    }
  }
  if (composer.handleAtomicMentionKeydown(e)) {
    refreshAutocomplete();
    return true;
  }
  if (mentionAutocomplete.handleKeydown(e)) {
    return true;
  }
  if (channelAutocomplete.handleKeydown(e)) {
    return true;
  }
  if (emojiAutocomplete.handleKeydown(e)) {
    return true;
  }
  if (!composerBarDisabled.value) {
    const wrapKind = resolveMarkdownComposerKeybind(e);
    if (wrapKind) {
      e.preventDefault();
      const { prefix, suffix } = markdownWrapDelimiters(wrapKind);
      applyComposerMarkdownShortcut(prefix, suffix);
      refreshAutocomplete();
      return true;
    }
  }
  // Desktop: Enter sends, Shift+Enter newline. Compact shell (typical phones): Enter newline —
  // phone keyboards rarely expose Shift+Enter; sending stays on the Send control.
  if (e.key === 'Enter' && (e.shiftKey || isCompactShell.value)) {
    if (e.shiftKey && !isCompactShell.value) {
      const live = composer.getContent();
      const listEdit = applyComposerOrderedListEnter(
        live,
        composer.getSelectionStart(),
        composer.getSelectionEnd(),
      );
      if (listEdit) {
        e.preventDefault();
        composer.setSerializedState(
          listEdit.content,
          composer.mentions.value,
          listEdit.selectionStart,
          listEdit.selectionEnd,
        );
        refreshAutocomplete();
        return true;
      }
    }
    e.preventDefault();
    /** TipTap hard break (not `insertText('\\n')` + `setContent`, which could mis-place the caret vs atoms/decoration). */
    tiptapEditor.value?.chain().focus().setHardBreak().run();
    void nextTick(() => refreshAutocomplete());
    return true;
  }
  if (e.key !== 'Enter') return false;
  if (e.shiftKey) return false;
  e.preventDefault();
  void handleSubmit();
  return true;
}

function handleEmojiAutocompleteSelect(emoji: string) {
  emojiAutocomplete.select(emoji);
  nextTick(() => composer.focus());
}

function handleMentionAutocompleteSelect(option: MentionOption) {
  mentionAutocomplete.select(option);
  void nextTick(() => {
    refreshAutocomplete();
    composer.focus();
  });
}

function handleChannelAutocompleteSelect(option: { id: string; name: string }) {
  channelAutocomplete.select(option);
  void nextTick(() => {
    refreshAutocomplete();
    composer.focus();
  });
}

async function handleSubmit() {
  if (!props.sendMessage) return;
  composer.flushComposerSync();
  ensureComposerHardFormatPrefix();
  const content = composer.content.value.trim();
  const hasContent = content.length > 0;
  const mentions = composer.mentions.value
    .filter((mention) => mention.end <= composer.content.value.length)
    .map((mention) => ({ ...mention }));
  const hasMedia =
    pendingImages.value.length > 0 ||
    pendingVideos.value.length > 0 ||
    pendingAudios.value.length > 0 ||
    pendingDocuments.value.length > 0 ||
    pendingExternalImages.value.length > 0 ||
    pendingGifs.value.length > 0;
  const hasMassMention = mentions.some(
    (mention) => mention.kind === 'everyone' || mention.kind === 'active',
  );
  if (!hasContent && !hasMedia) return;

  const submitTypes: OutgoingContentType[] = ['text'];
  if (hasMedia) submitTypes.push('media');
  if (hasMassMention) submitTypes.push('massMention');
  try {
    assertCanSend({
      channelId: props.channelId,
      contentTypes: submitTypes,
      context: composerSource,
    });
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Send blocked';
    return;
  }

  sendError.value = null;
  const replyTo = props.replyingTo ?? undefined;
  try {
    if (hasMedia) {
      send(
        props.channelId,
        content,
        mentions,
        pendingImages.value,
        pendingVideos.value,
        pendingAudios.value,
        pendingDocuments.value,
        pendingExternalImages.value,
        pendingGifs.value,
        replyTo,
      );
      clearPendingMedia({ revokeObjectUrls: false });
    } else {
      const docJson = composer.getContentJson();
      const jsonOk = docJson !== null && typeof docJson === 'object';
      props.sendMessage!(
        props.channelId,
        content,
        mentions,
        undefined,
        undefined,
        undefined,
        replyTo,
        undefined,
        undefined,
        undefined,
        jsonOk ? docJson : undefined,
        jsonOk ? ECHO_CONTENT_SCHEMA_VERSION : undefined,
      );
    }
    composer.clear();
    clearComposerDraft(props.channelId);
    emojiAutocomplete.close();
    mentionAutocomplete.close();
    channelAutocomplete.close();
    emit('clear-reply');
    void nextTick(() => {
      requestAnimationFrame(() => {
        /** Local sends must remain visible even if user was reading slightly above bottom. */
        keepLatestMessageVisible?.(false, true);
      });
    });
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Failed to send message';
  }
}

watch(
  () => props.channelId,
  (newChannelId, oldChannelId) => {
    if (oldChannelId?.trim()) {
      persistComposerDraftForChannel(oldChannelId);
    }
    // Channel switch should reset contextual send errors (e.g. guild slowmode/spam)
    // so DM composers do not display stale server-only warnings.
    sendError.value = null;
    clearPendingMedia();
    restoreComposerDraftForChannel(newChannelId);
    chatInputFocused.value = false;
    markdownPreviewOpen.value = false;
    markdownPreviewInline.value = false;
    if (markdownPreviewState) {
      markdownPreviewState.value = {
        ...markdownPreviewState.value,
        expanded: false,
      };
    }
    emojiAutocomplete.close();
    mentionAutocomplete.close();
    channelAutocomplete.close();
    emit('clear-reply');

    // Desktop: when switching/opening chats, keep typing frictionless by focusing the composer.
    // Guard rails:
    // - skip on compact shells (phones)
    // - skip when another text input already has focus
    // - skip when a modal dialog is open (focus should remain in the modal)
    if (!isCompactShell.value) {
      void nextTick(() => {
        requestAnimationFrame(() => {
          if (composerBarDisabled.value) return;
          if (pollModalOpen.value) return;
          if (activePopout.value) return;
          if (typeof document !== 'undefined') {
            const modalOpen = !!document.querySelector?.('[aria-modal="true"]');
            if (modalOpen) return;
            const ae = document.activeElement as HTMLElement | null;
            if (ae) {
              const tag = (ae.tagName || '').toLowerCase();
              const isTextField =
                tag === 'input' ||
                tag === 'textarea' ||
                tag === 'select' ||
                ae.isContentEditable;
              if (isTextField) return;
            }
          }
          composer.focus();
        });
      });
    }
  },
);

watch(
  () => props.replyingTo,
  async (val) => {
    if (val) {
      await nextTick();
      composer.focus();
    }
  },
);

watch(activePopout, () => {
  emojiAutocomplete.close();
  mentionAutocomplete.close();
  channelAutocomplete.close();
});

watch(
  () => composer.content.value,
  () => {
    refreshAutocomplete();
    schedulePersistComposerDraft();
  },
);

watch(
  () => composer.selectionStart.value,
  () => {
    if (
      !emojiAutocomplete.showPopup.value &&
      !mentionAutocomplete.showPopup.value &&
      !channelAutocomplete.showPopup.value
    ) {
      return;
    }
    refreshAutocomplete();
  },
);

watch(
  () =>
    [
      props.channelId,
      props.messageFormatTemplate,
      props.messageFormatHard,
    ] as const,
  () => {
    void nextTick(() => applyChannelMessageFormatAfterRestore());
  },
);

watch(
  () => composerBarDisabled.value,
  (disabled) => {
    composer.setEditable(!disabled);
  },
  { immediate: true },
);

function onEchoMessageFailedEv(ev: Event) {
  const d = (
    ev as CustomEvent<{
      code?: string;
      channelId?: string;
      /** Only optimistic chat sends include this; reactions/edits/pins use the same `message_failed` event without it. */
      clientMessageId?: string;
      detail?: string;
      draftContent?: string;
    }>
  ).detail;
  if (!d || d.channelId !== props.channelId) {
    return;
  }
  if (!d.clientMessageId?.trim()) {
    return;
  }

  if (d.draftContent && composer.content.value.trim().length === 0) {
    composer.insertText(d.draftContent);
  }

  if (d.code === 'SLOWMODE') {
    sendError.value = d.detail?.trim() || 'Slowmode is active in this channel.';
    return;
  }
  sendError.value = d.detail?.trim() || 'Message failed to send.';
}

onMounted(() => {
  restoreComposerDraftForChannel(props.channelId);
  composer.registerKeydownHandler(handleKeydown);
  window.addEventListener('echo-message-failed', onEchoMessageFailedEv);
});

onUnmounted(() => {
  if (composerDraftSaveTimer != null) {
    clearTimeout(composerDraftSaveTimer);
    composerDraftSaveTimer = null;
  }
  persistComposerDraftForChannel(props.channelId);
  window.dispatchEvent(
    new CustomEvent(ECHO_CHAT_COMPOSER_FOCUS_EVENT, {
      detail: { focused: false },
    }),
  );
  props.registerInsertUserMention?.(null);
  composer.registerKeydownHandler(null);
  window.removeEventListener('echo-message-failed', onEchoMessageFailedEv);
  if (communicationTimeoutTicker) clearInterval(communicationTimeoutTicker);
  clearPendingMedia();
});

watch(
  () => [props.registerInsertUserMention, composerBarDisabled.value] as const,
  () => {
    props.registerInsertUserMention?.(
      composerBarDisabled.value ? null : insertUserMentionAtCursor,
    );
  },
  { immediate: true },
);

const {
  selectionMenuPosition,
  showSelectionMenu,
  hideSelectionMenu: hideSelectionMenuCore,
  updateSelectionMenuPosition,
  handleComposerSelectionSync,
  formatBold,
  formatItalic,
  formatCode,
  formatSpoiler,
  formatStrike,
} = useChatInputSelectionMenu({
  chatInputFocused,
  composerContent: composer.content,
  composerEditor: tiptapEditor,
  composerSurfaceRef,
  selectionMenuRef,
  selectionStart: composer.selectionStart,
  selectionEnd: composer.selectionEnd,
  getSelectionStart: composer.getSelectionStart,
  getSelectionEnd: composer.getSelectionEnd,
  flushComposerSync: composer.flushComposerSync,
  wrapSelection: composer.wrapSelection,
});

function applyMarkdownPreviewMode(mode: MarkdownPreviewMenuMode) {
  mode = normalizeMarkdownPreviewModeForShipping(mode);
  if (mode === 'off') {
    markdownPreviewInline.value = false;
    markdownPreviewOpen.value = false;
    if (markdownPreviewState) {
      markdownPreviewState.value = {
        ...markdownPreviewState.value,
        expanded: false,
      };
    }
    return;
  }
  if (mode === 'inline') {
    markdownPreviewInline.value = true;
    markdownPreviewOpen.value = false;
    if (markdownPreviewState) {
      markdownPreviewState.value = {
        ...markdownPreviewState.value,
        expanded: false,
      };
    }
    return;
  }
  if (mode === 'split') {
    markdownPreviewInline.value = false;
    markdownPreviewOpen.value = true;
    if (markdownPreviewState) {
      markdownPreviewState.value = {
        ...markdownPreviewState.value,
        expanded: false,
      };
    }
    return;
  }
  markdownPreviewInline.value = false;
  markdownPreviewOpen.value = true;
  expandMarkdownPreviewCore();
}

function setMarkdownPreviewMode(mode: MarkdownPreviewMenuMode) {
  const normalized = normalizeMarkdownPreviewModeForShipping(mode);
  writeMarkdownPreviewModePreference(normalized);
  applyMarkdownPreviewMode(normalized);
}

function restoreMarkdownPreviewModeFromPreference() {
  const saved = readMarkdownPreviewModePreference();
  if (!saved || saved === 'off') return;
  const normalized = normalizeMarkdownPreviewModeForShipping(saved);
  if (normalized !== saved) {
    writeMarkdownPreviewModePreference(normalized);
  }
  applyMarkdownPreviewMode(normalized);
}

watch(showMarkdownPreviewToggle, (showing, wasShowing) => {
  if (!showing || wasShowing) return;
  nextTick(() => restoreMarkdownPreviewModeFromPreference());
});

onMounted(() => {
  if (showMarkdownPreviewToggle.value) {
    nextTick(() => restoreMarkdownPreviewModeFromPreference());
  }
});
</script>

<template>
  <div
    ref="wrapperRef"
    class="relative w-full"
    :class="isCompactShell ? 'px-0 pb-0' : 'px-4 pb-[10px]'"
    data-chat-insert-ui
  >
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />

    <EmojiPopout
      v-if="activePopout === 'emoji'"
      :server-id="serverId"
      :channel-id="channelId"
      :placement="props.popoutDirection ?? 'up'"
      :theme="props.popoutTheme ?? 'default'"
      @insert="insertEmoji"
      @send-sticker="sendSticker"
    />

    <AttachPopout
      v-if="activePopout === 'attach'"
      :can-upload-files="attachAllowsUpload"
      :can-create-polls="attachAllowsPoll"
      :placement="props.popoutDirection ?? 'up'"
      :theme="props.popoutTheme ?? 'default'"
      @upload="handleUploadClick"
      @create-poll="handleCreatePoll"
    />

    <GifPopout
      v-if="activePopout === 'gif'"
      :placement="props.popoutDirection ?? 'up'"
      :theme="props.popoutTheme ?? 'default'"
      :seed-keywords="props.gifPopoutSeedKeywords"
      :anchor-el="gifPopoutAnchorEl"
      @insert-gif="insertGif"
      @insert-image="insertImageFromSearch"
    />

    <PollCreateModal
      v-model="pollModalOpen"
      :server-id="serverId"
      :channel-id="channelId"
      @create="handlePollCreate"
    />

    <ImageViewerModal
      v-model="pendingImageViewerOpen"
      :images="pendingImageViewerItems"
      :initial-index="pendingImageViewerIndex"
    />

    <PendingMediaPreview
      :images="pendingImages"
      :videos="pendingVideos"
      :audios="pendingAudios"
      :documents="pendingDocuments"
      :external-images="pendingExternalImages"
      :gifs="pendingGifs"
      @remove-video="removeVideo"
      @remove-image="removeImage"
      @remove-audio="removeAudio"
      @remove-document="removeDocument"
      @remove-external-image="removeExternalImage"
      @remove-gif="removeGif"
      @preview-images="openPendingImagePreview"
    />

    <div
      v-if="sendError"
      role="alert"
      class="chat-send-error-banner mb-2 flex max-h-11 items-stretch gap-2 overflow-hidden rounded-lg bg-red-500/15 px-2.5 py-1.5"
    >
      <p
        class="min-h-0 min-w-0 flex-1 self-center text-[11px] leading-snug text-red-200/95 line-clamp-2 break-words"
        :title="sendError"
      >
        {{ displaySendError }}
      </p>
      <button
        type="button"
        class="chat-focus-ring shrink-0 self-start rounded px-1.5 py-0.5 text-[13px] leading-none text-red-200/80 hover:bg-glass-hover hover:text-red-100"
        aria-label="Dismiss error"
        @click="dismissSendError"
      >
        ×
      </button>
    </div>

    <div
      v-if="slowmodeInterval > 0 && lastOwnMessageAt"
      class="chat-slowmode-pill mb-2"
    >
      <div class="chat-slowmode-pill-inner">
        <svg
          class="chat-slowmode-clock"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v6l4 2"></path>
        </svg>
        <div class="chat-slowmode-text">
          <div class="chat-slowmode-line">
            <span class="chat-slowmode-label" v-if="slowmodeActive"
              >Slowmode active</span
            >
            <span class="chat-slowmode-label" v-else>Slowmode interval</span>
            <span class="chat-slowmode-time">{{
              slowmodeActive
                ? `${slowmodeRemainingSeconds}s`
                : `${slowmodeInterval}s`
            }}</span>
          </div>
          <div
            class="chat-slowmode-progress"
            role="progressbar"
            :aria-valuenow="slowmodeProgressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="chat-slowmode-progress-bar"
              :style="{ width: slowmodeProgressPercent + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <ChatInputMarkdownPreview
      ref="markdownPreviewRef"
      :markdown-preview-open="markdownPreviewOpen"
      :has-composer-content="hasComposerContent"
      :markdown-preview-expanded="markdownPreviewExpanded"
      :markdown-preview-inline="markdownPreviewInline"
      :markdown-preview-html="markdownPreviewHtml"
    />

    <div
      v-if="replyingTo"
      class="reply-bar mb-2 flex items-center gap-2 rounded-lg px-3 py-2"
    >
      <svg
        class="reply-bar__icon w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
        />
      </svg>
      <div class="min-w-0 flex-1">
        <span class="reply-bar__label text-xs font-medium"
          >Replying to {{ replyingTo.authorName }}</span
        >
        <p class="reply-bar__preview text-sm truncate">
          {{ truncateForReply(replyingTo.content) || 'Attachment' }}
        </p>
      </div>
      <button
        type="button"
        aria-label="Cancel reply"
        class="reply-bar__close chat-focus-ring rounded p-1"
        @click="emit('clear-reply')"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div v-if="showSlowmodeOverlay" class="chat-slowmode-overlay">
      <div class="chat-slowmode-overlay-inner">
        <svg
          class="chat-slowmode-clock"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v6l4 2"></path>
        </svg>
        <div class="chat-slowmode-copy">
          <div class="chat-slowmode-row">
            <span class="chat-slowmode-label">Slowmode active</span>
            <span class="chat-slowmode-seconds"
              >{{ slowmodeRemainingSeconds }}s</span
            >
          </div>
          <div class="chat-slowmode-bar">
            <div
              class="chat-slowmode-bar-fill"
              :style="{
                width: slowmodeProgressPercent + '%',
                transition: 'width 0.35s linear',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showPermissionLockOverlay"
      class="chat-permission-lock chat-input-bar rounded-lg px-4 py-3"
      role="status"
      :aria-label="`Message input locked. ${communicationTimeoutLockDetail}`"
    >
      <div class="chat-permission-lock-inner">
        <svg
          class="chat-permission-lock-icon"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <div class="chat-permission-lock-copy">
          <span class="chat-permission-lock-title">{{
            communicationTimeoutLockTitle
          }}</span>
          <p class="chat-permission-lock-detail">
            {{ communicationTimeoutLockDetail }}
          </p>
          <div
            v-if="communicationTimeoutActive"
            class="chat-timeout-lock-pill"
            aria-live="polite"
          >
            <span class="chat-timeout-lock-pill-label">Ends in</span>
            <span class="chat-timeout-lock-pill-value">{{
              communicationTimeoutCountdownLabel
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <ChatInputComposerBar
      ref="composerBarRef"
      v-if="!showSlowmodeOverlay && !showPermissionLockOverlay"
      :server-id="props.serverId"
      :popout-direction="props.popoutDirection ?? 'up'"
      :popout-theme="props.popoutTheme ?? 'default'"
      :show-mention-autocomplete="showMentionAutocomplete"
      :show-channel-autocomplete="showChannelAutocomplete"
      :show-emoji-autocomplete="showEmojiAutocomplete"
      :mention-autocomplete="mentionAutocomplete"
      :channel-autocomplete="channelAutocomplete"
      :emoji-autocomplete="emojiAutocomplete"
      :handle-mention-autocomplete-select="handleMentionAutocompleteSelect"
      :handle-channel-autocomplete-select="handleChannelAutocompleteSelect"
      :handle-emoji-autocomplete-select="handleEmojiAutocompleteSelect"
      :active-popout="activePopout"
      :toggle-popout="togglePopout"
      :all-spoilers="allSpoilers"
      :toggle-all-spoilers="toggleAllSpoilers"
      :show-markdown-preview-toggle="showMarkdownPreviewToggle"
      :markdown-preview-open="markdownPreviewOpen"
      :markdown-preview-inline="markdownPreviewInline"
      :markdown-preview-html="markdownPreviewHtml"
      :has-composer-content="hasComposerContent"
      :markdown-preview-expanded="markdownPreviewExpanded"
      :icons="composerToolbarIcons"
      :pending-images-length="pendingImages.length"
      :pending-videos-length="pendingVideos.length"
      :pending-audios-length="pendingAudios.length"
      :pending-documents-length="pendingDocuments.length"
      :pending-gifs-length="pendingGifs.length"
      :pending-external-images-length="pendingExternalImages.length"
      :composer-editor="tiptapEditor"
      :composer-emoji-only="composerEmojiOnly"
      :composer-content="composerContent"
      :composer-placeholder="composerPlaceholder"
      :composer-surface-ref="composerUiRefs.surface"
      :selection-menu-ref="composerUiRefs.menu"
      :show-selection-menu="showSelectionMenu"
      :selection-menu-position="selectionMenuPosition"
      :format-bold="formatBold"
      :format-italic="formatItalic"
      :format-strike="formatStrike"
      :format-code="formatCode"
      :format-spoiler="formatSpoiler"
      :channel-name="channelName"
      :handle-composer-pointer-down="handleComposerPointerDown"
      :handle-composer-selection-sync="handleComposerSelectionSync"
      :handle-composer-scroll="handleComposerScroll"
      :handle-input-focus="handleInputFocus"
      :handle-input-blur="handleInputBlur"
      :handle-keydown="handleKeydown"
      :handle-paste="handlePaste"
      :compact-inline-send-layout="isCompactShell && !!sendMessage"
      :compact-shell-layout="isCompactShell"
      :has-composer-payload="hasComposerPayload"
      :request-send="handleSubmit"
      :composer-disabled="composerBarDisabled"
      :composer-disabled-reason="composerBarDisabledReason"
      :can-open-attach="canOpenAttach"
      :attach-allows-upload="attachAllowsUpload"
      :attach-allows-poll="attachAllowsPoll"
      :handle-attach-upload="handleUploadClick"
      :handle-attach-create-poll="handleCreatePoll"
      :close-other-popouts="closePopout"
      :message-format-template="props.messageFormatTemplate"
      :message-format-hard="props.messageFormatHard === true"
      @set-markdown-preview-mode="setMarkdownPreviewMode"
    />
  </div>
</template>

<style lang="scss">
@use '@/features/chat/styles/markdownAlerts.scss' as mdAlerts;

.chat-permission-lock.chat-input-bar {
  background: var(--chat-permission-lock-bg);
  border: 1px solid var(--chat-permission-lock-border);
  color: var(--text);
}

.chat-permission-lock-inner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.chat-permission-lock-icon {
  flex-shrink: 0;
  color: var(--muted);
  margin-top: 1px;
}

.chat-permission-lock-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.chat-permission-lock-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.chat-permission-lock-detail {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted);
}

.chat-timeout-lock-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin-top: 2px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--mention-special-bg);
  color: var(--mention-special-fg);
  border: 1px solid
    color-mix(in srgb, var(--mention-special-fg) 24%, transparent);
}

.chat-timeout-lock-pill-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chat-timeout-lock-pill-value {
  font-size: 12px;
  font-weight: 700;
}

.chat-slowmode-overlay {
  padding: 0 12px;
}

.chat-slowmode-overlay-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
}

.chat-slowmode-clock {
  color: var(--chat-slowmode-amber);
  flex-shrink: 0;
}

.chat-slowmode-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.chat-slowmode-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
  color: var(--text);
}

.chat-slowmode-label {
  font-weight: 600;
  color: var(--text);
}

.chat-slowmode-seconds {
  font-weight: 700;
  color: var(--chat-slowmode-amber);
}

.chat-slowmode-bar {
  width: 240px;
  height: 6px;
  background: var(--chat-slowmode-bar-track);
  border-radius: 8px;
  margin-top: 8px;
  overflow: hidden;
}

.chat-slowmode-bar-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--chat-slowmode-bar-fill-start),
    var(--chat-slowmode-bar-fill-end)
  );
}

.reply-bar,
.chat-input-bar {
  background: var(--chat-glass-bg);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  isolation: isolate;
}

/*
 * iOS Safari compositor can blank layers while typing in contenteditable surfaces
 * when strong backdrop-filter + blur are active on the composer container.
 * Keep the same visual tone but disable blur on touch Safari for stability.
 */
@supports (-webkit-touch-callout: none) {
  @media (hover: none) and (pointer: coarse) {
    .chat-input-bar {
      background: var(--chat-glass-bg-strong);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
}

.reply-bar {
  border-left: 1px solid var(--chat-accent-muted);
  color: var(--text);

  &__icon,
  &__label {
    color: var(--accent);
  }

  &__preview {
    color: var(--muted);
  }

  &__close {
    color: var(--muted);

    &:hover {
      color: var(--text);
      background: var(--ui-glass-hover);
    }
  }
}

/* Inline composer preview only (wrapper .markdown-preview). :deep() requires scoped CSS; unscoped :deep() breaks v-html heading/paragraph rules vs Tailwind preflight. */
.markdown-preview {
  .markdown-preview-inner {
    position: relative;
    background-color: transparent;
    border-radius: 0.5rem;
  }

  .markdown-preview-inner::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-096);
    -webkit-backdrop-filter: blur(24px);
    backdrop-filter: blur(24px);
  }

  .markdown-preview__content {
    color: var(--vue-auto-009);
    @include mdAlerts.echo-markdown-alerts();
  }

  .markdown-preview__content p:first-child {
    margin-top: 0;
  }

  .markdown-preview__content p {
    margin: 0 0 0.5em;
  }

  .markdown-preview__content p:last-child {
    margin-bottom: 0;
  }

  .markdown-preview__content pre {
    margin: 0.5em 0;
    overflow-x: auto;
    max-width: 100%;
    border-radius: 6px;
    background: var(--vue-auto-019);
    padding: 0.5em 0.75em;
    font-size: 0.9em;
  }

  .markdown-preview__content code {
    border-radius: 4px;
    background: var(--vue-auto-031);
    padding: 0.15em 0.35em;
    font-size: 0.9em;
    overflow-wrap: break-word;
    word-break: break-all;
  }

  .markdown-preview__content pre code {
    background: transparent;
    padding: 0;
  }

  .markdown-preview__content blockquote {
    margin: 0.5rem 0;
    border-left: 3px solid var(--vue-auto-004);
    padding-left: 0.75rem;
    color: var(--vue-auto-060);
  }

  .markdown-preview__content ul {
    margin: 0.5em 0;
    padding-left: 1.5em;
    list-style-type: disc;
  }

  .markdown-preview__content ol {
    margin: 0.5em 0;
    padding-left: 1.5em;
    list-style-type: decimal;
  }

  .markdown-preview__content ul ul,
  .markdown-preview__content ol ul {
    list-style-type: circle;
  }

  .markdown-preview__content li {
    margin: 0.25em 0;
    display: list-item;
  }

  .markdown-preview__content a {
    color: var(--vue-auto-061);
    text-decoration: underline;
  }

  .markdown-preview__content a:hover {
    color: var(--vue-auto-062);
  }

  /* rem + explicit weight so headings win over Tailwind preflight (h1–h6 { font: inherit }) */
  .markdown-preview__content h1 {
    margin: 0.5em 0 0.25em;
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .markdown-preview__content h2 {
    margin: 0.5em 0 0.25em;
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .markdown-preview__content h3 {
    margin: 0.5em 0 0.25em;
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-preview__content h4,
  .markdown-preview__content h5,
  .markdown-preview__content h6 {
    margin: 0.45em 0 0.2em;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .markdown-preview__content table {
    margin: 0.5em 0;
    width: 100%;
    border-collapse: collapse;
    max-width: 100%;
    table-layout: fixed;
  }

  .markdown-preview__content th,
  .markdown-preview__content td {
    border: 1px solid var(--vue-auto-001);
    padding: 0.35em 0.6em;
    text-align: left;
  }

  .markdown-preview__content th {
    background: var(--vue-auto-031);
    font-weight: 600;
  }

  .markdown-preview__content tr:nth-child(even) td {
    background: var(--vue-auto-097);
  }

  .markdown-preview__content hr {
    margin: 1em 0;
    border: none;
    border-top: 1px solid var(--vue-auto-003);
  }

  .markdown-preview__content input[type='checkbox'] {
    margin-right: 0.35em;
    vertical-align: 0.2em;
    accent-color: var(--vue-auto-041);
  }

  .markdown-preview__content li:has(input[type='checkbox']) {
    list-style: none;
    margin-left: -1.5em;
  }

  .markdown-preview__content mark {
    background: var(--vue-auto-098);
    color: inherit;
    padding: 0.1em 0.2em;
    border-radius: 3px;
  }

  .markdown-preview__content sup[data-footnote-ref] {
    font-size: 0.75em;
  }

  .markdown-preview__content section[data-footnotes] {
    margin-top: 1em;
    padding-top: 0.75em;
    border-top: 1px solid var(--vue-auto-063);
    font-size: 0.9em;
    color: var(--vue-auto-041);
  }

  .markdown-preview__content section[data-footnotes] ol {
    margin: 0.5em 0 0;
    padding-left: 1.5em;
  }

  .markdown-preview__content .emoji {
    height: 1.1em;
    width: 1.1em;
    vertical-align: -0.15em;
    display: inline-block;
    object-fit: contain;
    box-sizing: content-box;
  }
}

.attach-button__glyph {
  transform: translateY(-1px);
}

.chat-input-editor {
  min-height: 40px;
  z-index: 10;
}

.attach-button {
  position: relative;
  z-index: 20;
}

/* Invisible mirror for selection position measurement */
.selection-mirror {
  position: absolute;
  inset: 0;
  padding: 0.5rem 0;
  font: inherit;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  visibility: hidden;
  pointer-events: none;
  z-index: 0;
}

.selection-menu-inner {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 10px;
  background-color: var(--echo-menu-surface-bg-fallback, var(--vue-auto-099));
  box-shadow:
    var(--echo-menu-surface-shadow, 0 4px 24px var(--vue-auto-011)),
    0 0 0 1px var(--echo-menu-surface-border, var(--vue-auto-002));
  border: 1px solid var(--echo-menu-surface-border, var(--vue-auto-001));
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .selection-menu-inner {
    background-color: var(--echo-menu-surface-bg, var(--vue-auto-099));
    backdrop-filter: var(--chat-glass-header-backdrop);
    -webkit-backdrop-filter: var(--chat-glass-header-backdrop);
  }
}

.selection-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--menu-item-icon);
  background: transparent;
  transition:
    background 0.15s,
    color 0.15s;
}

.selection-menu-btn:focus-visible {
  outline: none;
  filter: brightness(1.08);
}

.selection-menu-btn:hover {
  background: var(--menu-item-bg-hover);
  color: var(--menu-item-icon-hover);
}

.selection-menu-divider {
  width: 1px;
  height: 20px;
  background: color-mix(in srgb, var(--menu-item-icon) 34%, transparent);
  margin: 0 2px;
}

.selection-menu-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.chat-input-overlay,
.chat-input-textarea {
  font: inherit;
  line-height: 1.5;
  letter-spacing: inherit;
}

.chat-input-overlay {
  padding: 0.5rem 0;
}

/* pointer-events:none does not pass through to descendants; twemoji <img> would steal clicks */
.chat-input-overlay * {
  pointer-events: none;
}

.chat-input-overlay-content {
  color: var(--text);
}

.chat-input-overlay-content .composer-mention {
  color: var(--vue-auto-100);
  background: var(--vue-auto-101);
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.chat-input-overlay-content .composer-mention--special {
  color: var(--vue-auto-102);
  background: var(--vue-auto-103);
}

.chat-input-overlay-content .composer-mention--channel {
  color: var(--vue-auto-104);
  background: var(--vue-auto-105);
}

.chat-input-textarea {
  color: transparent;
  caret-color: var(--text);
  -webkit-text-fill-color: transparent;
  pointer-events: auto;
}

.chat-input-textarea::placeholder {
  color: var(--vue-auto-064);
  -webkit-text-fill-color: var(--vue-auto-064);
}

/* Mirror token width (see composer-emoji-token-slot) so overlay lines up with textarea; img stays emoji-sized. */
.chat-input-overlay-content .composer-emoji-token-slot {
  display: inline-block;
  text-align: center;
  vertical-align: -0.2em;
  line-height: inherit;
  box-sizing: border-box;
}

.chat-input-overlay .emoji,
.chat-input-textarea .emoji {
  height: 1.25em;
  width: 1.25em;
  max-height: 1.25em;
  max-width: 1.25em;
  vertical-align: -0.2em;
  display: inline-block;
  object-fit: contain;
  box-sizing: content-box;
}
</style>
