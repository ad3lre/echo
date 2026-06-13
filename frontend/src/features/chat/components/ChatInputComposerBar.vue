<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import type { Ref } from 'vue';
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';

import { EditorContent } from '@tiptap/vue-3';
import type { Editor as VueEditor } from '@tiptap/vue-3';
import type { Editor } from '@tiptap/core';
import type {
  useMentionAutocomplete,
  MentionOption,
} from '@/composables/useMentionAutocomplete';
import type { useChannelAutocomplete } from '@/composables/useChannelAutocomplete';
import type { useEmojiAutocomplete } from '@/composables/useEmojiAutocomplete';
import EmojiAutocompletePopover from '@/components/chat/EmojiAutocompletePopover.vue';
import MentionAutocompletePopover from '@/components/chat/MentionAutocompletePopover.vue';
import ChannelAutocompletePopover from '@/components/chat/ChannelAutocompletePopover.vue';
import {
  INLINE_MARKDOWN_PREVIEW_UI_ENABLED,
  type MarkdownPreviewMenuMode,
} from '@/features/chat/composables/markdownPreviewModePreference';
import { isComposerContentEffectivelyEmpty } from '@/features/chat/editor/composerModel';
const props = defineProps<{
  popoutDirection?: 'up' | 'down';
  popoutTheme?: 'default' | 'forum';
  showMentionAutocomplete: boolean;
  showChannelAutocomplete: boolean;
  showEmojiAutocomplete: boolean;
  mentionAutocomplete: ReturnType<typeof useMentionAutocomplete>;
  channelAutocomplete: ReturnType<typeof useChannelAutocomplete>;
  emojiAutocomplete: ReturnType<typeof useEmojiAutocomplete>;
  handleMentionAutocompleteSelect: (option: MentionOption) => void;
  handleChannelAutocompleteSelect: (option: {
    id: string;
    name: string;
  }) => void;
  handleEmojiAutocompleteSelect: (emoji: string) => void;
  activePopout: 'emoji' | 'gif' | 'attach' | null;
  togglePopout: (kind: 'emoji' | 'gif' | 'attach') => void;
  allSpoilers: boolean;
  toggleAllSpoilers: () => void;
  showMarkdownPreviewToggle: boolean;
  markdownPreviewOpen: boolean;
  markdownPreviewInline: boolean;
  /** Parsed HTML for split / expanded preview and shared state. */
  markdownPreviewHtml: string;
  hasComposerContent: boolean;
  markdownPreviewExpanded: boolean;
  icons: { gif: string; emotes: string };
  pendingImagesLength: number;
  pendingVideosLength: number;
  pendingAudiosLength: number;
  pendingDocumentsLength: number;
  pendingGifsLength: number;
  pendingExternalImagesLength: number;
  composerEditor: Editor | null;
  /** When true, scale overlay emojis (unicode + custom) like emoji-only messages. */
  composerEmojiOnly?: boolean;
  composerContent: string;
  composerPlaceholder: string;
  composerSurfaceRef: Ref<HTMLElement | null>;
  selectionMenuRef: Ref<HTMLElement | null>;
  showSelectionMenu: boolean;
  selectionMenuPosition: { top: number; left: number };
  formatBold: () => void;
  formatItalic: () => void;
  formatStrike: () => void;
  formatCode: () => void;
  formatSpoiler: () => void;
  channelName: string;
  handleComposerPointerDown: (e: MouseEvent) => void;
  handleComposerSelectionSync?: () => void;
  handleComposerScroll: () => void;
  handleInputFocus: (e: FocusEvent) => void;
  handleInputBlur: (e: FocusEvent) => void;
  handleKeydown: (e: KeyboardEvent) => void;
  handlePaste: (e: ClipboardEvent) => void;
  /** Resolves custom channel icons (emoji keys, raster URLs) like the sidebar. */
  serverId?: string;
  composerDisabled?: boolean;
  composerDisabledReason?: string;
  canOpenAttach?: boolean;
  attachAllowsUpload?: boolean;
  attachAllowsPoll?: boolean;
  handleAttachUpload?: () => void;
  handleAttachCreatePoll?: () => void;
  /** When opening the markdown menu, close emoji/gif/attach popouts (parent `usePopoutStack`). */
  closeOtherPopouts?: () => void;
  /** Mobile shell: text Send inside the surface when there is something to send. */
  compactInlineSendLayout?: boolean;
  /** Compact viewport: edge-to-edge composer chrome (no outer inset / bottom gap). */
  compactShellLayout?: boolean;
  hasComposerPayload?: boolean;
  requestSend?: () => void | Promise<void>;
}>();

export type { MarkdownPreviewMenuMode };

const emit = defineEmits<{
  'set-markdown-preview-mode': [mode: MarkdownPreviewMenuMode];
}>();

// The composer builds its instance from `@tiptap/core`, whose `Editor` is
// nominally distinct from the `@tiptap/vue-3` one `EditorContent` expects even
// though they are the same object at runtime; bridge the gap once here.
const composerEditorForContent = computed(
  () => props.composerEditor as unknown as VueEditor | null,
);

const markdownMenuOpen = ref(false);
const markdownMenuRootRef = ref<HTMLElement | null>(null);
const surfaceSizingClass = computed(() => {
  if (props.popoutTheme === 'forum') {
    return 'min-h-[140px] max-h-[420px]';
  }
  if (props.compactInlineSendLayout) {
    return 'min-h-[24px] max-h-[min(280px,40vh)]';
  }
  return 'min-h-[24px] max-h-[200px]';
});

const dockClass = computed(() =>
  props.popoutDirection === 'down'
    ? 'absolute top-full left-10 mt-1 z-20'
    : 'absolute bottom-full left-10 mb-1 z-20',
);

const currentMarkdownMenuMode = computed<MarkdownPreviewMenuMode>(() => {
  if (props.markdownPreviewInline) return 'inline';
  if (props.markdownPreviewExpanded) return 'full';
  if (props.markdownPreviewOpen) return 'split';
  return 'off';
});

const markdownMenuActive = computed(
  () => currentMarkdownMenuMode.value !== 'off',
);

const pendingMediaCount = computed(
  () =>
    (props.pendingImagesLength ?? 0) +
    (props.pendingVideosLength ?? 0) +
    (props.pendingAudiosLength ?? 0) +
    (props.pendingDocumentsLength ?? 0) +
    (props.pendingExternalImagesLength ?? 0) +
    (props.pendingGifsLength ?? 0),
);

const showInlineMobileSend = computed(
  () =>
    !!props.compactInlineSendLayout &&
    (!!props.hasComposerPayload || pendingMediaCount.value > 0),
);

/** Compact shell: Send in the toolbar (forum uses Post instead). */
const showMobileSendInToolbar = computed(
  () => showInlineMobileSend.value && props.popoutTheme !== 'forum',
);

/** Compact shell while composing: collapse secondary toolbar actions into one menu. */
const showMobileComposerOverflowMenu = computed(
  () => !!props.compactInlineSendLayout && showInlineMobileSend.value,
);

const showComposerPlaceholder = computed(() =>
  isComposerContentEffectivelyEmpty(props.composerContent),
);

const mobileOverflowMenuOpen = ref(false);
const mobileOverflowMenuRootRef = ref<HTMLElement | null>(null);

function closeMobileOverflowMenu() {
  mobileOverflowMenuOpen.value = false;
}

function toggleMobileOverflowMenu() {
  const next = !mobileOverflowMenuOpen.value;
  if (next) {
    props.closeOtherPopouts?.();
    closeMarkdownMenu();
  }
  mobileOverflowMenuOpen.value = next;
}

function runOverflowAction(action: () => void) {
  closeMobileOverflowMenu();
  action();
}

function openMarkdownModeFromOverflow(mode: MarkdownPreviewMenuMode) {
  closeMobileOverflowMenu();
  selectMarkdownMode(mode);
}

function toggleMarkdownMenu() {
  const next = !markdownMenuOpen.value;
  if (next) {
    props.closeOtherPopouts?.();
  }
  markdownMenuOpen.value = next;
}

function closeMarkdownMenu() {
  markdownMenuOpen.value = false;
}

function selectMarkdownMode(mode: MarkdownPreviewMenuMode) {
  emit('set-markdown-preview-mode', mode);
  closeMarkdownMenu();
}

let markdownMenuEscHandler: ((e: KeyboardEvent) => void) | null = null;
let markdownMenuDocDown: ((e: MouseEvent) => void) | null = null;
let markdownMenuOpenGen = 0;
let mobileOverflowEscHandler: ((e: KeyboardEvent) => void) | null = null;
let mobileOverflowDocDown: ((e: MouseEvent) => void) | null = null;
let mobileOverflowOpenGen = 0;

watch(showMobileComposerOverflowMenu, (enabled) => {
  if (!enabled) closeMobileOverflowMenu();
});

watch(mobileOverflowMenuOpen, (open) => {
  if (mobileOverflowEscHandler) {
    document.removeEventListener('keydown', mobileOverflowEscHandler);
    mobileOverflowEscHandler = null;
  }
  if (mobileOverflowDocDown) {
    document.removeEventListener('mousedown', mobileOverflowDocDown, true);
    mobileOverflowDocDown = null;
  }
  if (!open) {
    mobileOverflowOpenGen++;
    return;
  }
  const gen = mobileOverflowOpenGen;
  mobileOverflowEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMobileOverflowMenu();
  };
  document.addEventListener('keydown', mobileOverflowEscHandler);
  void nextTick(() => {
    if (gen !== mobileOverflowOpenGen || !mobileOverflowMenuOpen.value) return;
    mobileOverflowDocDown = (e: MouseEvent) => {
      const root = mobileOverflowMenuRootRef.value;
      if (root && !root.contains(e.target as Node)) closeMobileOverflowMenu();
    };
    document.addEventListener('mousedown', mobileOverflowDocDown, true);
  });
});

watch(markdownMenuOpen, (open) => {
  if (markdownMenuEscHandler) {
    document.removeEventListener('keydown', markdownMenuEscHandler);
    markdownMenuEscHandler = null;
  }
  if (markdownMenuDocDown) {
    document.removeEventListener('mousedown', markdownMenuDocDown, true);
    markdownMenuDocDown = null;
  }
  if (!open) {
    markdownMenuOpenGen++;
    return;
  }
  const gen = markdownMenuOpenGen;
  markdownMenuEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMarkdownMenu();
  };
  document.addEventListener('keydown', markdownMenuEscHandler);
  void nextTick(() => {
    if (gen !== markdownMenuOpenGen || !markdownMenuOpen.value) return;
    markdownMenuDocDown = (e: MouseEvent) => {
      const root = markdownMenuRootRef.value;
      if (root && !root.contains(e.target as Node)) closeMarkdownMenu();
    };
    document.addEventListener('mousedown', markdownMenuDocDown, true);
  });
});

onUnmounted(() => {
  if (markdownMenuEscHandler)
    document.removeEventListener('keydown', markdownMenuEscHandler);
  if (markdownMenuDocDown)
    document.removeEventListener('mousedown', markdownMenuDocDown, true);
  if (mobileOverflowEscHandler)
    document.removeEventListener('keydown', mobileOverflowEscHandler);
  if (mobileOverflowDocDown)
    document.removeEventListener('mousedown', mobileOverflowDocDown, true);
});

function bindRef<E extends HTMLElement>(
  el: Element | ComponentPublicInstance | null,
  r: Ref<E | null>,
) {
  r.value = (el as E | null) ?? null;
}

const gifPopoutAnchorRef = ref<HTMLElement | null>(null);
const emojiPopoutAnchorRef = ref<HTMLElement | null>(null);

defineExpose({
  gifPopoutAnchorRef,
  emojiPopoutAnchorRef,
});
</script>

<template>
  <div class="relative">
    <div v-if="showMentionAutocomplete" :class="dockClass">
      <MentionAutocompletePopover
        :suggestions="mentionAutocomplete.suggestions"
        :selected-index="mentionAutocomplete.selectedIndex"
        :theme="props.popoutTheme ?? 'default'"
        @select="handleMentionAutocompleteSelect"
      />
    </div>
    <div v-if="showChannelAutocomplete" :class="dockClass">
      <ChannelAutocompletePopover
        :suggestions="channelAutocomplete.suggestions"
        :selected-index="channelAutocomplete.selectedIndex"
        :theme="props.popoutTheme ?? 'default'"
        :server-id="props.serverId"
        @select="handleChannelAutocompleteSelect"
      />
    </div>
    <div v-if="showEmojiAutocomplete" :class="dockClass">
      <EmojiAutocompletePopover
        :suggestions="emojiAutocomplete.suggestions"
        :selected-index="emojiAutocomplete.selectedIndex"
        :theme="props.popoutTheme ?? 'default'"
        @select="handleEmojiAutocompleteSelect"
      />
    </div>
    <div
      class="chat-input-bar flex min-w-0 items-end gap-2 rounded-lg px-4 py-2 sm:gap-3"
      :class="{
        'chat-input-bar--forum': props.popoutTheme === 'forum',
        'chat-input-bar--compact-shell': props.compactShellLayout,
      }"
    >
      <button
        v-if="props.popoutTheme !== 'forum'"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="activePopout === 'attach'"
        :disabled="composerDisabled || canOpenAttach === false"
        class="chat-focus-ring attach-button relative z-20 flex items-center justify-center self-center rounded-md transition-all hover:scale-110 hover:bg-glass-hover w-6 h-6 flex-shrink-0 p-1"
        :class="{
          'bg-glass-2 opacity-100': activePopout === 'attach',
          'opacity-80': activePopout !== 'attach',
          'cursor-not-allowed opacity-40 hover:scale-100 hover:bg-transparent':
            composerDisabled || canOpenAttach === false,
        }"
        :title="composerDisabled ? composerDisabledReason : undefined"
        @click="togglePopout('attach')"
      >
        <span
          class="attach-button__glyph font-medium text-lg leading-none text-foreground"
          >+</span
        >
      </button>

      <div
        class="chat-input-editor relative z-10 flex-grow min-w-0"
        :class="{ 'chat-input-editor--emoji-only': composerEmojiOnly }"
      >
        <Teleport to="body">
          <div
            v-if="showSelectionMenu"
            :ref="(el) => bindRef(el, props.selectionMenuRef)"
            class="selection-menu fixed z-[300]"
            :style="{
              top: `${selectionMenuPosition.top}px`,
              left: `${selectionMenuPosition.left}px`,
              transform: 'translate(-50%, -100%)',
            }"
            @mousedown.prevent
          >
            <div class="selection-menu-inner">
              <button
                type="button"
                class="selection-menu-btn"
                aria-label="Bold"
                @click.prevent="formatBold"
              >
                <svg
                  class="selection-menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                  <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                </svg>
              </button>
              <button
                type="button"
                class="selection-menu-btn"
                aria-label="Italic"
                @click.prevent="formatItalic"
              >
                <svg
                  class="selection-menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="19" y1="4" x2="10" y2="4" />
                  <line x1="14" y1="20" x2="5" y2="20" />
                  <line x1="15" y1="4" x2="9" y2="20" />
                </svg>
              </button>
              <button
                type="button"
                class="selection-menu-btn"
                aria-label="Strikethrough"
                @click.prevent="formatStrike"
              >
                <svg
                  class="selection-menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                  <path d="M14 12a4 4 0 0 1 0 8H6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                </svg>
              </button>
              <span class="selection-menu-divider" aria-hidden="true" />
              <button
                type="button"
                class="selection-menu-btn"
                aria-label="Code"
                @click.prevent="formatCode"
              >
                <svg
                  class="selection-menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>
              <button
                type="button"
                class="selection-menu-btn"
                aria-label="Spoiler"
                @click.prevent="formatSpoiler"
              >
                <svg
                  class="selection-menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>
        </Teleport>
        <div
          :ref="(el) => bindRef(el, props.composerSurfaceRef)"
          class="chat-input-surface-wrap chat-focus-ring custom-scrollbar relative z-10 min-w-0 overflow-x-hidden overflow-y-auto overscroll-y-contain py-2 outline-none touch-pan-y"
          :class="[
            surfaceSizingClass,
            {
              'chat-input-surface-wrap--disabled': composerDisabled,
              'chat-input-surface-wrap--empty': showComposerPlaceholder,
            },
          ]"
          :title="composerDisabled ? composerDisabledReason : undefined"
          @mousedown="handleComposerPointerDown($event)"
          @mouseup="handleComposerSelectionSync?.()"
          @keyup="handleComposerSelectionSync?.()"
          @scroll="handleComposerScroll"
          @focusin="handleInputFocus($event as FocusEvent)"
          @focusout="handleInputBlur($event as FocusEvent)"
          @paste="handlePaste"
        >
          <div
            v-if="showComposerPlaceholder"
            aria-hidden="true"
            class="chat-input-placeholder pointer-events-none absolute inset-x-0 top-2 z-[2] truncate pr-1 text-left text-muted"
            :title="composerPlaceholder"
          >
            {{ composerPlaceholder }}
          </div>
          <div class="chat-input-editor-stack relative min-h-[24px] min-w-0">
            <EditorContent
              v-if="composerEditorForContent"
              :editor="composerEditorForContent"
              class="chat-input-surface min-w-0 w-full"
            />
          </div>
        </div>
      </div>

      <div class="composer-right-rail relative z-20 flex shrink-0 items-center">
        <div
          class="composer-toolbar-actions relative flex items-center gap-1 flex-shrink-0"
        >
          <template v-if="props.popoutTheme === 'forum'">
            <button
              type="button"
              aria-label="Upload file"
              :disabled="composerDisabled || attachAllowsUpload === false"
              class="chat-focus-ring p-1 rounded-md transition-all hover:scale-110 hover:bg-glass-hover"
              :class="{
                'opacity-80': true,
                'cursor-not-allowed opacity-40 hover:scale-100 hover:bg-transparent':
                  composerDisabled || attachAllowsUpload === false,
              }"
              :title="composerDisabled ? composerDisabledReason : undefined"
              @click="handleAttachUpload?.()"
            >
              <svg
                class="w-6 h-6 text-fg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Create poll"
              :disabled="composerDisabled || attachAllowsPoll === false"
              class="chat-focus-ring p-1 rounded-md transition-all hover:scale-110 hover:bg-glass-hover"
              :class="{
                'opacity-80': true,
                'cursor-not-allowed opacity-40 hover:scale-100 hover:bg-transparent':
                  composerDisabled || attachAllowsPoll === false,
              }"
              :title="composerDisabled ? composerDisabledReason : undefined"
              @click="handleAttachCreatePoll?.()"
            >
              <svg
                class="w-6 h-6 text-fg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </button>
          </template>
          <button
            v-if="
              pendingImagesLength > 0 ||
              pendingVideosLength > 0 ||
              pendingAudiosLength > 0 ||
              pendingDocumentsLength > 0 ||
              pendingExternalImagesLength > 0 ||
              pendingGifsLength > 0
            "
            type="button"
            :aria-pressed="allSpoilers"
            :title="allSpoilers ? 'Mark as not spoiler' : 'Mark as spoiler'"
            class="chat-focus-ring p-1 rounded-md transition-all hover:scale-110 hover:bg-glass-hover"
            :class="
              allSpoilers
                ? 'bg-amber-500/30 text-amber-400 opacity-100'
                : 'opacity-80'
            "
            @click="toggleAllSpoilers"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
          <div
            v-if="showMarkdownPreviewToggle"
            ref="markdownMenuRootRef"
            class="relative shrink-0"
          >
            <button
              type="button"
              class="chat-focus-ring composer-toolbar-markdown-btn flex items-center justify-center rounded-md p-1 text-lg font-medium leading-none transition-colors hover:bg-glass-hover"
              :class="
                markdownMenuActive
                  ? 'bg-glass-2 text-foreground'
                  : props.popoutTheme === 'forum'
                    ? 'text-fg-soft opacity-85'
                    : 'text-muted opacity-80'
              "
              :aria-expanded="markdownMenuOpen"
              aria-haspopup="menu"
              title="Markdown preview mode"
              @click.stop="toggleMarkdownMenu"
            >
              m
            </button>
            <div
              v-if="markdownMenuOpen"
              class="chat-md-menu absolute right-0 z-[60] min-w-[220px] rounded-xl py-1 shadow-xl backdrop-blur-xl"
              :class="
                props.popoutDirection === 'down'
                  ? 'top-full mt-1'
                  : 'bottom-full mb-1'
              "
              role="menu"
              aria-label="Markdown preview"
              @mousedown.prevent
              @click.stop
            >
              <button
                type="button"
                role="menuitemradio"
                :aria-checked="currentMarkdownMenuMode === 'off'"
                class="chat-md-menu__item w-full px-3 py-2 text-left text-sm transition-colors"
                @click="selectMarkdownMode('off')"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="chat-md-menu__check w-4 shrink-0 text-center text-xs"
                  >
                    {{ currentMarkdownMenuMode === 'off' ? '✓' : '' }}
                  </span>
                  <span>
                    <span class="font-medium">Source only</span>
                    <span
                      class="chat-md-menu__hint mt-0.5 block text-[11px] font-normal"
                      >No preview</span
                    >
                  </span>
                </span>
              </button>
              <!-- Inline mode: hidden when INLINE_MARKDOWN_PREVIEW_UI_ENABLED is false; code paths remain in ChatInput + composerMarkdownDecorations. -->
              <button
                v-if="INLINE_MARKDOWN_PREVIEW_UI_ENABLED"
                type="button"
                role="menuitemradio"
                :aria-checked="currentMarkdownMenuMode === 'inline'"
                class="chat-md-menu__item w-full px-3 py-2 text-left text-sm transition-colors"
                @click="selectMarkdownMode('inline')"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="chat-md-menu__check w-4 shrink-0 text-center text-xs"
                  >
                    {{ currentMarkdownMenuMode === 'inline' ? '✓' : '' }}
                  </span>
                  <span>
                    <span class="font-medium">Inline preview</span>
                    <span
                      class="chat-md-menu__hint mt-0.5 block text-[11px] font-normal"
                      >Headings, lists, links, fences, and inline marks—same
                      source as split preview</span
                    >
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="menuitemradio"
                :aria-checked="currentMarkdownMenuMode === 'split'"
                class="chat-md-menu__item w-full px-3 py-2 text-left text-sm transition-colors"
                @click="selectMarkdownMode('split')"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="chat-md-menu__check w-4 shrink-0 text-center text-xs"
                  >
                    {{ currentMarkdownMenuMode === 'split' ? '✓' : '' }}
                  </span>
                  <span>
                    <span class="font-medium">Split preview</span>
                    <span
                      class="chat-md-menu__hint mt-0.5 block text-[11px] font-normal"
                      >Panel above the input</span
                    >
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="menuitemradio"
                :aria-checked="currentMarkdownMenuMode === 'full'"
                class="chat-md-menu__item w-full px-3 py-2 text-left text-sm transition-colors"
                @click="selectMarkdownMode('full')"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="chat-md-menu__check w-4 shrink-0 text-center text-xs"
                  >
                    {{ currentMarkdownMenuMode === 'full' ? '✓' : '' }}
                  </span>
                  <span>
                    <span class="font-medium">Full preview</span>
                    <span
                      class="chat-md-menu__hint mt-0.5 block text-[11px] font-normal"
                      >Large preview in chat area</span
                    >
                  </span>
                </span>
              </button>
            </div>
          </div>
          <button
            ref="gifPopoutAnchorRef"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="activePopout === 'gif'"
            :disabled="composerDisabled"
            class="chat-focus-ring p-1 rounded-md transition-all hover:scale-110 hover:bg-glass-hover"
            :class="{
              'bg-glass-2 opacity-100': activePopout === 'gif',
              'opacity-80': activePopout !== 'gif',
              'cursor-not-allowed opacity-40 hover:scale-100 hover:bg-transparent':
                composerDisabled,
            }"
            :title="composerDisabled ? composerDisabledReason : undefined"
            @click="togglePopout('gif')"
          >
            <img :src="icons.gif" alt="GIF" class="w-6 h-6 chat-toolbar-icon" />
          </button>
          <button
            ref="emojiPopoutAnchorRef"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="activePopout === 'emoji'"
            class="chat-focus-ring p-1 rounded-md transition-all hover:scale-110 hover:bg-glass-hover"
            :class="{
              'bg-glass-2 opacity-100': activePopout === 'emoji',
              'opacity-80': activePopout !== 'emoji',
            }"
            @click="togglePopout('emoji')"
          >
            <img
              :src="icons.emotes"
              alt="Emotes"
              class="w-6 h-6 chat-toolbar-icon"
            />
          </button>
        </div>

        <div class="composer-send-slot relative flex shrink-0 items-center">
          <button
            v-if="showMobileSendInToolbar"
            type="button"
            class="chat-focus-ring chat-mobile-send-btn ml-0.5 inline-flex h-8 shrink-0 touch-manipulation items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors"
            :disabled="composerDisabled"
            :title="composerDisabled ? composerDisabledReason : 'Send message'"
            aria-label="Send message"
            @click="void props.requestSend?.()"
          >
            Send
          </button>
          <button
            v-if="props.popoutTheme === 'forum'"
            type="button"
            class="chat-focus-ring forum-send-btn ml-1 inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors"
            :disabled="composerDisabled || !hasComposerPayload"
            :title="composerDisabled ? composerDisabledReason : 'Publish post'"
            aria-label="Publish post"
            @click="void props.requestSend?.()"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-input-bar--compact-shell {
  width: 100%;
  border-radius: 0;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.composer-right-rail {
  gap: 0.25rem;
  contain: layout style;
}

.composer-toolbar-actions :deep(.chat-focus-ring) {
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.composer-toolbar-actions :deep(.chat-focus-ring:hover) {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .composer-toolbar-actions :deep(.chat-focus-ring) {
    transition: none;
  }
}

.chat-input-bar--compact-stacked {
  flex-wrap: wrap;
  row-gap: 0.375rem;
  align-items: flex-end;

  .composer-right-rail {
    order: -1;
    flex: 0 0 100%;
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    align-self: auto;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  }

  .composer-toolbar-actions {
    flex: 1 1 auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .chat-input-editor {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.chat-mobile-send-btn,
.forum-send-btn {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent-contrast-fg);
}

.chat-mobile-send-btn:hover:not(:disabled),
.forum-send-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
}

.chat-mobile-send-btn:disabled,
.forum-send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.chat-toolbar-icon {
  filter: var(--chat-composer-toolbar-icon-filter, none);
  opacity: var(--chat-composer-toolbar-icon-opacity, 1);
  isolation: isolate;
  transform: translateZ(0);
}

.chat-md-menu {
  border: 1px solid var(--border);
  background: var(--elevated);
}

.chat-md-menu__item {
  color: var(--text);

  &:hover {
    background: var(--vue-auto-003);
  }
}

.chat-md-menu__check {
  color: var(--muted);
}

.chat-md-menu__hint {
  color: var(--muted);
  opacity: 0.85;
}

/* Match message bubble “emoji-only” feel in the composer (unicode + custom <img class="emoji">). */
.chat-input-editor--emoji-only .chat-input-surface :deep(.emoji) {
  height: 2.5em;
  width: 2.5em;
  max-width: 100%;
  max-height: 2.5em;
  min-width: 0;
  min-height: 0;
  vertical-align: -0.25em;
  object-fit: contain;
}

.chat-input-editor--emoji-only
  .chat-input-surface
  :deep(.tiptap .composer-custom-emoji),
.chat-input-editor--emoji-only
  .chat-input-surface
  :deep(.tiptap .composer-app-icon) {
  vertical-align: -0.25em;
}

.chat-input-surface-wrap--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/*
 * Empty TipTap docs still expose a focusable <br> in the DOM. After select-all + delete,
 * Ctrl+A can highlight that "invisible" node while our placeholder overlay is shown.
 */
.chat-input-surface-wrap--empty .chat-input-surface :deep(.tiptap) {
  user-select: none;
}

.chat-input-surface-wrap--empty .chat-input-surface :deep(.tiptap::selection),
.chat-input-surface-wrap--empty
  .chat-input-surface
  :deep(.tiptap *::selection) {
  background: transparent;
  color: inherit;
}

.chat-input-surface {
  min-height: 24px;
}

.chat-input-surface :deep(.tiptap) {
  min-height: 24px;
  color: var(--text);
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.875rem;
  line-height: 1.5;
  letter-spacing: normal;
}

/* iOS Safari auto-zooms focused editable fields below 16px, which manifests as horizontal overflow. */
@supports (-webkit-touch-callout: none) {
  @media (hover: none) and (pointer: coarse) {
    .chat-input-surface :deep(.tiptap) {
      font-size: 16px;
    }
  }
}

.chat-input-surface :deep(.tiptap p) {
  margin: 0;
}

/*
 * ProseMirror adds a trailing <br> after inline atoms (custom emoji, app icons) so the
 * caret can follow them; without this rule it reads as a blank second line in the composer.
 */
.chat-input-surface :deep(.tiptap br.ProseMirror-trailingBreak) {
  display: none;
}

.chat-input-surface :deep(.tiptap .composer-mention),
.chat-input-surface :deep(.tiptap .composer-mention--channel),
.chat-input-surface :deep(.tiptap .composer-mention--special) {
  display: inline-flex;
  align-items: center;
  border-radius: 0.45rem;
  padding: 0.05rem 0.35rem;
  margin: 0 0.05rem;
  font-weight: 500;
  line-height: 1.35;
  background: var(--vue-auto-081);
  color: var(--vue-auto-051);
}

.chat-input-surface :deep(.tiptap .composer-mention--channel) {
  background: var(--vue-auto-293);
  color: var(--vue-auto-052);
}

.chat-input-surface :deep(.tiptap .composer-mention--special) {
  background: var(--vue-auto-294);
  color: var(--vue-auto-053);
}

/*
 * Custom emoji atoms must stay true inline-level: `inline-flex` participates in baseline
 * alignment in a way that can temporarily inflate the line box (looks like an extra line)
 * until more text is typed. `inline-block` + text-baseline alignment matches unicode emoji.
 */
.chat-input-surface :deep(.tiptap .composer-custom-emoji) {
  display: inline-block;
  vertical-align: -0.2em;
  line-height: 1;
  margin: 0 0.03em;
}

.chat-input-surface :deep(.tiptap .composer-app-icon) {
  display: inline-block;
  vertical-align: -0.2em;
  line-height: 1;
  margin: 0 0.03em;
}

.chat-input-surface :deep(.tiptap .composer-image-slot) {
  display: block;
  width: 100%;
  max-width: min(100%, 20rem);
  margin: 0.35rem 0;
  border-radius: 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--elevated) 88%, transparent);
  overflow: hidden;
}

.chat-input-surface :deep(.tiptap .composer-image-slot__label) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}

.chat-input-surface :deep(.tiptap .composer-image-slot__img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.chat-input-surface :deep(.tiptap .composer-button-row) {
  display: block;
  width: 100%;
  max-width: min(100%, 24rem);
  margin: 0.35rem 0;
  padding: 0.45rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--elevated) 88%, transparent);
}

.chat-input-surface :deep(.tiptap .composer-button-row__label) {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}

.chat-input-surface :deep(.tiptap .emoji) {
  height: 1.25em;
  width: 1.25em;
  max-height: 1.25em;
  max-width: 1.25em;
  display: inline-block;
  object-fit: contain;
  vertical-align: -0.2em;
}

/* Shown until emoji URL or icon catalog URL is available — avoids broken <img src="">. */
.chat-input-surface :deep(.tiptap .composer-inline-glyph-fallback) {
  display: inline-block;
  box-sizing: border-box;
  min-width: 1.25em;
  max-width: 7em;
  height: 1.25em;
  padding: 0 0.2em;
  font-size: 0.68em;
  font-weight: 500;
  line-height: 1.25em;
  border-radius: 0.25em;
  background: var(--vue-auto-031);
  color: var(--vue-auto-041);
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* compact markdown delimiter styling (ProseMirror decorations, same document as caret) */
.chat-input-surface :deep(.tiptap .composer-md-delim) {
  color: var(--muted);
  opacity: 0.55;
  font-weight: inherit;
  font-style: inherit;
  text-decoration: none;
}

.chat-input-surface :deep(.tiptap .composer-md-bold) {
  font-weight: 700;
}

.chat-input-surface :deep(.tiptap .composer-md-underline) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-input-surface :deep(.tiptap .composer-md-code) {
  border-radius: 0.25rem;
  background: var(--vue-auto-031);
  padding: 0.04em 0.2em;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 0.92em;
}

.chat-input-surface :deep(.tiptap .composer-md-strike) {
  text-decoration: line-through;
}

.chat-input-surface :deep(.tiptap .composer-md-spoiler) {
  border-radius: 0.25rem;
  background: var(--vue-auto-031);
  filter: blur(4px);
  transition: filter 0.15s ease;
}

.chat-input-surface :deep(.tiptap .composer-md-spoiler:hover) {
  filter: none;
}

.chat-input-surface :deep(.tiptap .composer-md-code-block) {
  display: block;
  margin: 0.15em 0;
  border-radius: 0.35rem;
  padding: 0.35em 0.5em;
  background: var(--vue-auto-031);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 0.88em;
  line-height: 1.45;
  white-space: pre-wrap;
}

.chat-input-surface :deep(.tiptap .composer-md-h1) {
  font-size: 1.35em;
  font-weight: 700;
  line-height: 1.25;
}

.chat-input-surface :deep(.tiptap .composer-md-h2) {
  font-size: 1.22em;
  font-weight: 700;
  line-height: 1.28;
}

.chat-input-surface :deep(.tiptap .composer-md-h3) {
  font-size: 1.12em;
  font-weight: 650;
  line-height: 1.3;
}

.chat-input-surface :deep(.tiptap .composer-md-h4) {
  font-size: 1.06em;
  font-weight: 650;
}

.chat-input-surface :deep(.tiptap .composer-md-h5) {
  font-size: 1.02em;
  font-weight: 600;
}

.chat-input-surface :deep(.tiptap .composer-md-h6) {
  font-size: 0.98em;
  font-weight: 600;
  color: var(--muted);
}

.chat-input-surface :deep(.tiptap .composer-md-hr) {
  color: var(--muted);
  opacity: 0.65;
  font-size: 0.75em;
  letter-spacing: 0.12em;
}

.chat-input-surface :deep(.tiptap .composer-md-blockquote) {
  color: var(--muted);
}

.chat-input-surface :deep(.tiptap .composer-md-list-content) {
  font-weight: inherit;
}

.chat-input-surface :deep(.tiptap .composer-md-link-text) {
  color: var(--accent);
  font-weight: 500;
}

.chat-input-surface :deep(.tiptap .composer-md-link-url) {
  color: var(--accent);
  opacity: 0.85;
  font-size: 0.9em;
}

.chat-input-surface :deep(.tiptap .composer-md-footnote-ref) {
  color: var(--accent);
  font-size: 0.88em;
  vertical-align: super;
  line-height: 0;
}

.chat-input-surface :deep(.tiptap .composer-md-highlight) {
  border-radius: 0.2rem;
  background: var(--md-mark-bg);
  padding: 0.04em 0.12em;
}
</style>
