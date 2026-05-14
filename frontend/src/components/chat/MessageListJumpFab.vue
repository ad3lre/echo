<script setup lang="ts">
import { computed, inject } from 'vue';
import {
  MESSAGE_LIST_JUMP_UI_KEY,
  type MessageListJumpUi,
} from '@/features/chat/viewModel/messageListJumpUi';

const props = defineProps<{
  messageScrollAnchor: 'top' | 'bottom';
  messageCount: number;
  /** Hide while skeletons, empty states, or import widget — not jump-related. */
  listUiBlocked: boolean;
}>();

const emit = defineEmits<{
  (e: 'jump'): void;
}>();

const jumpUi = inject<MessageListJumpUi>(MESSAGE_LIST_JUMP_UI_KEY);

const showFab = computed(() => {
  if (!jumpUi) return false;
  if (props.messageScrollAnchor !== 'bottom') return false;
  if (props.messageCount <= 0) return false;
  if (props.listUiBlocked) return false;
  return (
    jumpUi.scrollAwayFromBottom.value || jumpUi.pendingNewWhileAway.value > 0
  );
});

const badgeText = computed(() => {
  if (!jumpUi) return '';
  const n = jumpUi.pendingNewWhileAway.value;
  if (n <= 0) return '';
  if (n >= 100) return '99+';
  return String(n);
});

const ariaLabel = computed(() =>
  badgeText.value
    ? `${badgeText.value} new messages — jump to latest`
    : 'Jump to latest messages',
);
</script>

<template>
  <button
    v-if="showFab"
    type="button"
    class="chat-focus-ring message-list-jump-fab pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-foreground shadow-lg transition-[transform,box-shadow,background-color] hover:shadow-xl md:bottom-4"
    :aria-label="ariaLabel"
    @click="emit('jump')"
  >
    <span class="whitespace-nowrap">Jump to latest</span>
    <span
      v-if="badgeText"
      class="max-w-[3.25rem] truncate rounded-md bg-accent/25 px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground"
    >
      {{ badgeText }}
    </span>
    <svg
      class="h-4 w-4 shrink-0 opacity-90"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.message-list-jump-fab {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--surface) 78%, transparent) 0%,
    color-mix(in srgb, var(--bg) 72%, transparent) 55%,
    color-mix(in srgb, var(--bg) 74%, transparent) 100%
  );
  backdrop-filter: blur(30px) saturate(1.35);
  -webkit-backdrop-filter: blur(30px) saturate(1.35);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
    0 10px 30px color-mix(in srgb, var(--bg) 45%, transparent);
}

.message-list-jump-fab:hover {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--surface) 84%, transparent) 0%,
    color-mix(in srgb, var(--bg) 78%, transparent) 55%,
    color-mix(in srgb, var(--bg) 80%, transparent) 100%
  );
}
</style>
