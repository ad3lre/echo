<script setup lang="ts">
import { computed } from 'vue';
import {
  HISTORY_SKELETON_ROWS,
  type HistorySkeletonRow,
} from './messageListHistorySkeleton';

const props = defineProps<{
  /** Accessible label for history vs navigation loading. */
  ariaLabel?: string;
  /** Optional data-driven rows; falls back to the static template. */
  rows?: HistorySkeletonRow[];
}>();

const skeletonRows = computed(() =>
  props.rows?.length ? props.rows : HISTORY_SKELETON_ROWS,
);
</script>

<template>
  <div
    class="message-list-history-skeleton flex w-full flex-col"
    role="status"
    aria-live="polite"
    :aria-label="ariaLabel ?? 'Loading messages'"
  >
    <div
      v-for="(row, index) in skeletonRows"
      :key="index"
      class="skeleton-row flex items-start gap-4 px-1"
      :class="[
        row.grouped ? 'skeleton-row--continuation' : 'skeleton-row--header',
        {
          'skeleton-row--first': index === 0,
          'skeleton-row--clustered': !row.grouped && row.clustered,
        },
      ]"
      aria-hidden="true"
    >
      <!-- Avatar (header) or empty time gutter (continuation), matching the live row. -->
      <div
        v-if="!row.grouped"
        class="message-list-skeleton-pulse mt-1 h-10 w-10 shrink-0 rounded-full"
      />
      <div v-else class="w-10 shrink-0" />

      <div class="min-w-0 flex-1">
        <!-- Author name + timestamp line (header rows only). -->
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
        <!-- Body lines, each sized to the live message line box for matching rhythm. -->
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
        <!-- Attachment / image-slot aspect boxes (full column width like live media). -->
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
  </div>
</template>

<style scoped lang="scss">
/*
 * Mirror MessageBubble group rhythm (features/chat/styles/messageBubble.scss) so the
 * skeleton predicts real density: headers open a fresh group, continuations stay tight.
 * Same density custom properties + fallbacks keep it aligned across density presets.
 */
.skeleton-row--header {
  margin-top: var(--echo-density-msg-header-mt, 1.0625rem);
  padding-top: var(--echo-density-msg-header-py, 0.25rem);
  padding-bottom: var(--echo-density-msg-header-py, 0.25rem);
}

.skeleton-row--first {
  margin-top: var(--echo-density-msg-header-first-mt, 1.5rem);
}

/* First row of a same-author cluster: header chrome, tighter gap below. */
.skeleton-row--clustered {
  padding-bottom: var(--echo-density-msg-continuation-py, 0.0625rem);
}

.skeleton-row--continuation {
  padding-top: var(--echo-density-msg-continuation-py, 0.0625rem);
  padding-bottom: var(--echo-density-msg-continuation-py, 0.0625rem);
}

/* Match the live message line box (font-size 0.9375rem / line-height 1.375rem). */
.skeleton-line {
  height: 1.375rem;
}

/*
 * Media placeholders hint at attachments without dominating: a tall portrait
 * (e.g. 3/4) would otherwise resolve to ~850px at full column width and, with
 * the bottom-anchored overlay, fill the viewport as one giant block. Cap the
 * height so it reads as a media slot, not a wall.
 */
.skeleton-media {
  max-height: 12rem;
}

/*
 * Contrast-based fill (mirrors MemberList) — NOT --overlay-subtle, which is a
 * darkening scrim (near-black on dark themes) and renders the bars invisible.
 */
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
