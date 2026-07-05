<script setup lang="ts">
import type { HistorySkeletonRow } from './messageListHistorySkeleton';

defineProps<{
  row: HistorySkeletonRow;
  isFirst?: boolean;
}>();
</script>

<template>
  <!-- Mirrors MessageBubble outer structure: same density tokens and flex layout. -->
  <article
    class="message-bubble pointer-events-none px-1"
    :class="[
      row.grouped ? 'msg-continuation' : 'msg-header',
      {
        'msg-header--first': isFirst && !row.grouped,
        'msg-header--clustered': !row.grouped && row.clustered,
        'msg-continuation--followed': row.grouped && row.clustered,
      },
    ]"
    aria-hidden="true"
  >
    <div class="flex items-start gap-4">
      <div
        v-if="!row.grouped"
        class="message-list-skeleton-pulse mt-1 h-10 w-10 shrink-0 rounded-full"
      />
      <div v-else class="w-10 shrink-0" />

      <div class="min-w-0 flex-1">
        <div v-if="!row.grouped" class="skeleton-line flex items-center gap-2">
          <div
            class="message-list-skeleton-pulse h-[0.95rem] rounded"
            :class="row.nameWidth ?? 'w-24'"
          />
          <div
            class="message-list-skeleton-pulse h-[0.6rem] rounded"
            :class="row.timeWidth ?? 'w-10'"
          />
        </div>
        <div
          v-for="(widthClass, lineIndex) in row.lineWidths"
          :key="lineIndex"
          class="skeleton-line flex items-center"
        >
          <div
            class="message-list-skeleton-pulse h-[0.85rem] rounded"
            :class="widthClass"
          />
        </div>
        <div
          v-for="(block, blockIndex) in row.imageBlocks ?? []"
          :key="`img-${blockIndex}`"
          class="skeleton-media my-2 block w-full max-w-[min(100%,40rem)] min-w-0"
          :style="{ aspectRatio: `${block.aspectW} / ${block.aspectH}` }"
        >
          <div
            class="message-list-skeleton-pulse h-full w-full rounded-lg"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.skeleton-line {
  height: 1.375rem;
}

.skeleton-media {
  max-height: 12rem;
}

.message-list-skeleton-pulse {
  background: color-mix(in srgb, var(--text) 11%, transparent);
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
