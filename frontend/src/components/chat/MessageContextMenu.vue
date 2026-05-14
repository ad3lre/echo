<script setup lang="ts">
import { ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import { icons } from '@/assets/icons';

const menuRootEl = ref<HTMLElement | null>(null);

defineExpose({
  getMenuRootElement: () => menuRootEl.value,
});

defineProps<{
  message: MessageWithAuthor;
  isOwnMessage?: boolean;
  showModActions?: boolean;
  /**
   * Right-click + dev mode: show every applicable developer copy action (IDs),
   * instead of a single action tied to click target.
   */
  showExpandedDeveloperIds?: boolean;
  /** When true, show “View profile” in the User section (parent wires `onOpenProfile`). */
  showOpenProfile?: boolean;
  channelId?: string;
  isPinned?: boolean;
  menuPosition: { left: number; top: number };
  menuOpen: boolean;
  showMentionAuthorInComposer?: boolean;
  canPin?: boolean;
  canUnpin?: boolean;
  showForward?: boolean;
  /** When true, show “View reactions” (message has reactions). */
  showViewReactions?: boolean;
  /** When true, show “Copy image” (raster attachment / legacy image / sticker). */
  showCopyImage?: boolean;
  timeoutActive?: boolean;
}>();

defineEmits<{
  enterEditMode: [];
  handleDelete: [];
  copyMessage: [];
  copyImage: [];
  copyRawMessage: [];
  copyMessageLink: [];
  forwardMessage: [];
  mentionAuthor: [];
  copyAuthorId: [];
  copyMessageId: [];
  copyQuotedReplyMessageId: [];
  copyChannelId: [];
  openAuthorProfile: [];
  copyAuthorUsername: [];
  pin: [];
  unpin: [];
  confirmModDelete: [];
  moderate: [action: 'kick' | 'ban' | 'timeout', timeoutMinutes?: number];
  viewReactions: [];
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      ref="menuRootEl"
      data-echo-message-context-menu
      class="ellipsis-menu fixed z-[100] min-w-[160px] py-1"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      @mousedown.stop
    >
      <button
        v-if="isOwnMessage"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('enterEditMode')"
      >
        <svg
          class="w-4 h-4 shrink-0"
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
        Edit
      </button>
      <button
        v-if="isOwnMessage"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2 rounded-sm"
        @click="$emit('handleDelete')"
      >
        <svg
          class="w-4 h-4 shrink-0"
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
        Delete
      </button>
      <button
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('copyMessage')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        Copy message
      </button>
      <button
        v-if="showCopyImage"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('copyImage')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        Copy image
      </button>
      <button
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('copyRawMessage')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        Copy as written
      </button>
      <button
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('copyMessageLink')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        Copy message link
      </button>

      <template v-if="showOpenProfile || (message.author?.name ?? '').trim()">
        <div class="my-1 border-t border-border" role="separator" />
        <div
          class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
        >
          User
        </div>
        <button
          v-if="showOpenProfile"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('openAuthorProfile')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-sky-300/90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          View profile
        </button>
        <button
          v-if="(message.author?.name ?? '').trim()"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('copyAuthorUsername')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy username
        </button>
      </template>

      <button
        v-if="showViewReactions"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('viewReactions')"
      >
        <svg
          class="w-4 h-4 shrink-0 text-indigo-400"
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
        View reactions
      </button>
      <button
        v-if="showForward"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('forwardMessage')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        Forward
      </button>
      <button
        v-if="showMentionAuthorInComposer"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('mentionAuthor')"
      >
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-fg-soft"
          aria-hidden="true"
          >@</span
        >
        Direct mention
      </button>
      <template v-if="showExpandedDeveloperIds">
        <div class="my-1 border-t border-border" role="separator" />
        <div
          class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
        >
          Developer
        </div>
        <button
          v-if="message.authorId"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('copyAuthorId')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy author ID
        </button>
        <button
          v-if="message.id"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('copyMessageId')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy message ID
        </button>
        <button
          v-if="message.replyTo?.messageId"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('copyQuotedReplyMessageId')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy quoted message ID
        </button>
        <button
          v-if="channelId"
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
          @click="$emit('copyChannelId')"
        >
          <svg
            class="w-4 h-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy channel ID
        </button>
      </template>
      <button
        v-if="canPin && !isPinned"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('pin')"
      >
        <img
          :src="icons.thumbtack"
          alt=""
          class="w-4 h-4 shrink-0 filter invert"
        />
        Pin message
      </button>
      <button
        v-if="canUnpin && isPinned"
        type="button"
        class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover flex items-center gap-2 rounded-sm"
        @click="$emit('unpin')"
      >
        <img
          :src="icons.thumbtack"
          alt=""
          class="w-4 h-4 shrink-0 filter invert"
        />
        Unpin message
      </button>

      <template v-if="showModActions">
        <div class="my-1 border-t border-border" role="separator" />
        <div
          class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/90"
        >
          Moderation
        </div>
        <button
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2 rounded-sm"
          @click="$emit('confirmModDelete')"
        >
          <svg
            class="w-4 h-4 shrink-0"
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
          Delete message
        </button>
        <button
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-amber-200/95 hover:bg-amber-500/15 flex items-center gap-2 rounded-sm"
          @click="$emit('moderate', 'timeout', 60)"
        >
          <svg
            class="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ timeoutActive ? 'Remove timeout' : 'Timeout (1 hour)' }}
        </button>
        <button
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-orange-200 hover:bg-orange-500/15 flex items-center gap-2 rounded-sm"
          @click="$emit('moderate', 'kick')"
        >
          <svg
            class="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          Kick from server
        </button>
        <button
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/20 flex items-center gap-2 rounded-sm"
          @click="$emit('moderate', 'ban')"
        >
          <svg
            class="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          Ban from server
        </button>
      </template>
    </div>
  </Teleport>
</template>
