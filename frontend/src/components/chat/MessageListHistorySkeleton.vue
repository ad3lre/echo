<script setup lang="ts">
import { HISTORY_SKELETON_ROWS } from './messageListHistorySkeleton';

defineProps<{
  /** Accessible label for history vs navigation loading. */
  ariaLabel?: string;
}>();
</script>

<template>
  <div
    class="message-list-history-skeleton flex w-full flex-col"
    role="status"
    aria-live="polite"
    :aria-label="ariaLabel ?? 'Loading messages'"
  >
    <div
      v-for="(row, index) in HISTORY_SKELETON_ROWS"
      :key="index"
      class="message-list-skeleton-row flex items-start gap-4 px-1"
      :class="row.grouped ? 'msg-continuation' : 'msg-header'"
      aria-hidden="true"
    >
      <div
        v-if="!row.grouped"
        class="message-list-skeleton-pulse mt-1 h-10 w-10 shrink-0 rounded-full"
      />
      <div v-else class="w-10 shrink-0" />
      <div class="min-w-0 flex-1 flex flex-col gap-1.5 pt-0.5">
        <div
          v-if="!row.grouped"
          class="message-list-skeleton-pulse h-3 w-24 rounded"
        />
        <div
          v-for="(widthClass, lineIndex) in row.lineWidths"
          :key="lineIndex"
          class="message-list-skeleton-pulse h-3 rounded"
          :class="widthClass"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message-list-skeleton-pulse {
  background: var(--overlay-subtle);
  animation: message-list-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes message-list-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-list-skeleton-pulse {
    animation: none;
    opacity: 0.6;
  }
}
</style>
