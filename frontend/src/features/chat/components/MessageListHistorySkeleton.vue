<script setup lang="ts">
import { computed } from 'vue';
import {
  HISTORY_SKELETON_ROWS,
  type HistorySkeletonRow,
} from './messageListHistorySkeleton';
import MessageListHistorySkeletonRow from './MessageListHistorySkeletonRow.vue';

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
    <MessageListHistorySkeletonRow
      v-for="(row, index) in skeletonRows"
      :key="index"
      :row="row"
      :is-first="index === 0"
      aria-hidden="true"
    />
  </div>
</template>
