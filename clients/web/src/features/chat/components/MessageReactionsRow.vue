<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/features/dev/devSettings';
import { copyToClipboard } from '@/features/chat/copyToClipboard';
import { emojiReactionDevCopyValue } from '@/features/chat/emoji/emojiDevCopy';

const props = defineProps<{
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>;
  messageId?: string;
  currentUserId?: string;
  poppingEmojiKey: string | null;
  parseSingleEmoji: (emoji: string) => string;
  onReactionClick: (emoji: string) => void;
  onAddReaction: (e: MouseEvent) => void | Promise<void>;
  onReactionHoverStart?: (
    reaction: { emoji: string; count: number; userIds: string[] },
    anchorEl: HTMLElement,
  ) => void;
  onReactionHoverEnd?: () => void;
}>();

function isMyReaction(r: { userIds: string[] }): boolean {
  return Boolean(
    props.currentUserId && r.userIds.includes(props.currentUserId),
  );
}

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

function onReactionPillContextMenu(ev: MouseEvent, emoji: string) {
  if (!devModeIdsEnabled.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  copyToClipboard(emojiReactionDevCopyValue(emoji));
}
</script>

<template>
  <div
    v-if="reactions.length > 0"
    class="reactions-row mt-1.5 flex flex-wrap gap-1.5 items-center"
  >
    <button
      v-for="r in reactions"
      :key="r.emoji"
      type="button"
      class="reaction-pill chat-focus-ring flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors"
      :class="[
        isMyReaction(r) ? 'reaction-pill--yours' : 'reaction-pill--others',
        {
          'reaction-pill--pop':
            poppingEmojiKey ===
            (messageId ? `${messageId}-${r.emoji}` : r.emoji),
        },
      ]"
      :data-echo-hint="`Reacted by ${r.count} ${r.count === 1 ? 'person' : 'people'}`"
      @click="onReactionClick(r.emoji)"
      @contextmenu="onReactionPillContextMenu($event, r.emoji)"
      @mouseenter="
        ($event) =>
          onReactionHoverStart?.(r, $event.currentTarget as HTMLElement)
      "
      @mouseleave="onReactionHoverEnd?.()"
      @focus="
        ($event) =>
          onReactionHoverStart?.(r, $event.currentTarget as HTMLElement)
      "
      @blur="onReactionHoverEnd?.()"
    >
      <span class="reaction-emoji" v-html="parseSingleEmoji(r.emoji)"></span>
      <span
        class="text-xs reaction-count"
        :class="isMyReaction(r) ? 'reaction-count--yours' : 'text-muted'"
      >
        {{ r.count }}
      </span>
    </button>
    <button
      type="button"
      class="add-react-pill reaction-pill chat-focus-ring flex items-center justify-center px-2 py-0.5 rounded-full text-sm transition-opacity opacity-0 pointer-events-none group-hover:opacity-60 group-hover:pointer-events-auto hover:opacity-100 pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto"
      title="Add reaction"
      data-echo-hint="Add reaction"
      @click="onAddReaction"
    >
      <span
        class="reaction-emoji add-react-emoji"
        v-html="parseSingleEmoji('🙂')"
      ></span>
    </button>
  </div>
</template>

<style scoped lang="scss">
/* Co-located with the row so scoped styles apply (parent MessageBubble scoped CSS did not reach this child). */
.reaction-pill {
  background: var(--vue-auto-296);
  box-shadow: none;
  border: none;
}

/* Your reactions: blue / accent-tinted pill so they read vs reactions you did not add */
.reaction-pill--yours {
  background: color-mix(in srgb, var(--accent) 32%, var(--elevated));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, var(--border));
}
.reaction-pill--yours:hover {
  background: color-mix(in srgb, var(--accent) 44%, var(--elevated));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 58%, var(--border));
}

.reaction-pill--others:hover {
  background: var(--vue-auto-019);
}

/* Light theme: vue-auto-* pill tokens stay ink-colored; use frost + semantic fg */
html[data-theme='light'] .reaction-pill--others {
  background: color-mix(in srgb, var(--elevated) 82%, var(--ui-glass-3));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent);
}
html[data-theme='light'] .reaction-pill--others:hover {
  background: color-mix(in srgb, var(--elevated) 72%, var(--ui-glass-hover));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 78%, transparent);
}
html[data-theme='light'] .add-react-pill {
  background: color-mix(in srgb, var(--elevated) 88%, var(--ui-glass-2));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 52%, transparent);
}
html[data-theme='light'] .add-react-pill:hover {
  background: color-mix(in srgb, var(--elevated) 76%, var(--ui-glass-hover));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent);
}
html[data-theme='light'] .reaction-pill--others .reaction-count {
  color: var(--muted);
}

.reaction-count--yours {
  color: color-mix(in srgb, var(--accent) 78%, var(--text));
  font-weight: 600;
}

.reaction-pill--pop {
  animation: reaction-pop 0.4s ease-out;
}

@keyframes reaction-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.25);
  }
  65% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

.add-react-pill {
  background: var(--vue-auto-298);
  border: none;
}
.add-react-pill:hover {
  background: var(--vue-auto-031);
}

/* Twemoji is <img class="emoji"> — use fixed rem size (em on img was unreliable and parent rules never hit). */
.reaction-emoji :deep(.custom-emoji-inline) {
  position: relative;
  display: inline-block;
  width: 1.125rem;
  height: 1.125rem;
  vertical-align: middle;
}

.reaction-emoji :deep(.custom-emoji-skeleton) {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  background: var(--vue-auto-001);
  animation: reaction-custom-emoji-skeleton-pulse 1.2s ease-in-out infinite;
}

.reaction-emoji
  :deep(
    .custom-emoji-inline:not(.custom-emoji-inline--loading):not(
        .custom-emoji-inline--pending
      )
      .custom-emoji-skeleton
  ) {
  display: none;
}

.reaction-emoji :deep(.custom-emoji-inline img.custom-emoji) {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

.reaction-emoji :deep(.custom-emoji-inline img.custom-emoji--pending-load) {
  opacity: 0;
}

.reaction-emoji :deep(img.emoji) {
  width: 1.125rem !important;
  height: 1.125rem !important;
  max-width: 1.125rem;
  max-height: 1.125rem;
  min-width: 1.125rem;
  min-height: 1.125rem;
  object-fit: contain;
  vertical-align: middle;
  display: inline-block;
}

/* Slight cool / blue emphasis on the glyph when you are in the reactor set */
.reaction-pill--yours .reaction-emoji :deep(img.emoji) {
  filter: saturate(1.12) brightness(1.05)
    drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 35%, transparent));
}

.add-react-emoji :deep(img.emoji) {
  filter: grayscale(0.6);
  opacity: 0.8;
}
.add-react-pill:hover .add-react-emoji :deep(img.emoji) {
  filter: grayscale(0.2);
  opacity: 1;
}

@keyframes reaction-custom-emoji-skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-emoji :deep(.custom-emoji-skeleton) {
    animation: none;
    opacity: 0.7;
  }
}
</style>
