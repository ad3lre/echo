<script setup lang="ts">
import { ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';

const props = defineProps<{
  message: MessageWithAuthor;
  isOwnMessage?: boolean;
  shiftPressed?: boolean;
  menuOpen?: boolean;
  reactionPopoverOpen?: boolean;
  poppingQuickEmoji?: string | null;
  /** Hover quick-react row (MRU / defaults); same merge as edit-mode quick emojis. */
  quickReactionRow: { emoji: string; html: string }[];
  parseSingleEmojiForReactions: (emoji: string) => string;
  /**
   * When true, the bar is rendered in a teleported fixed layer; omit absolute offsets
   * so the parent supplies viewport position (avoids overflow clipping in virtual rows).
   */
  floating?: boolean;
}>();

/** Exposed for MessageBubble so the context menu can anchor to the ⋯ button (fixed positioning). */
const ellipsisRef = ref<HTMLElement | null>(null);
defineExpose({ ellipsisRef });

defineEmits<{
  quickReact: [emoji: string, event: MouseEvent];
  removeQuickReactionFavorite: [emoji: string];
  openReactionPopover: [e: MouseEvent];
  reply: [];
  enterEditMode: [];
  handleDelete: [];
  toggleMenu: [e: MouseEvent];
}>();
</script>

<template>
  <div
    class="message-actions msg-actions-bar flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg"
    :class="
      props.floating
        ? 'relative z-10 bg-scrim-2 shadow-md ring-1 ring-border backdrop-blur-sm opacity-100'
        : [
            'absolute -top-3 right-1 z-10',
            menuOpen || reactionPopoverOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100',
          ]
    "
    data-dev-hit="message"
  >
    <button
      v-for="fav in quickReactionRow"
      :key="fav.emoji"
      type="button"
      class="msg-action-btn msg-action-emoji chat-focus-ring p-1 rounded hover:bg-glass-hover text-muted hover:text-foreground flex items-center justify-center"
      :class="{ 'msg-action-emoji--pop': poppingQuickEmoji === fav.emoji }"
      :title="`React with ${fav.emoji} · right-click to remove from quick bar`"
      v-html="parseSingleEmojiForReactions(fav.emoji)"
      @click="$emit('quickReact', fav.emoji, $event)"
      @contextmenu.prevent.stop="
        $emit('removeQuickReactionFavorite', fav.emoji)
      "
    />
    <div
      v-if="quickReactionRow.length > 0"
      class="w-px h-4 flex-shrink-0 bg-glass-active rounded-full mx-0.5"
      aria-hidden="true"
    />
    <button
      type="button"
      class="msg-action-btn chat-focus-ring p-1 rounded hover:bg-glass-hover text-muted hover:text-foreground"
      title="Add reaction"
      @click="$emit('openReactionPopover', $event)"
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
          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
    <button
      type="button"
      class="msg-action-btn chat-focus-ring p-1 rounded hover:bg-glass-hover text-muted hover:text-foreground"
      title="Reply"
      @click="$emit('reply')"
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
          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
        />
      </svg>
    </button>
    <template v-if="isOwnMessage">
      <button
        type="button"
        class="msg-action-btn chat-focus-ring p-1 rounded hover:bg-glass-hover text-muted hover:text-foreground"
        title="Edit"
        @click="$emit('enterEditMode')"
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
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
      <button
        v-show="shiftPressed"
        type="button"
        class="msg-action-btn chat-focus-ring p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400"
        title="Delete (hold Shift)"
        @click="$emit('handleDelete')"
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
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </template>
    <div class="relative">
      <button
        ref="ellipsisRef"
        type="button"
        class="msg-action-btn chat-focus-ring p-1 rounded hover:bg-glass-hover text-muted hover:text-foreground"
        title="More options"
        @click="$emit('toggleMenu', $event)"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
 * Twemoji / custom reaction imgs have no width/height attrs; without this they blow up.
 * Scoped styles on MessageBubble do not apply here (different SFC scope).
 * Match sibling controls: SVG icons use Tailwind w-4 h-4 (= 1rem).
 */
.msg-action-emoji {
  :deep(img.emoji),
  :deep(img.custom-emoji) {
    width: 1rem;
    height: 1rem;
    max-width: 1rem;
    max-height: 1rem;
    display: block;
    object-fit: contain;
  }
}
</style>
