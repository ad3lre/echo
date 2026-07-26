<script setup lang="ts">
import { computed } from 'vue';
import {
  planMediaCollage,
  chatAttachmentMediaBoxStyle,
  type CollageSourceItem,
} from '@/features/chat/domain/messageMediaCollage';
import MessageMediaCollageCell from './MessageMediaCollageCell.vue';

const props = defineProps<{ items: CollageSourceItem[] }>();
const emit = defineEmits<{ open: [url: string] }>();

const plan = computed(() => planMediaCollage(props.items));

const boxStyle = computed(() =>
  chatAttachmentMediaBoxStyle({
    columns: plan.value?.columns,
    rows: plan.value?.rows,
  }),
);
</script>

<template>
  <div v-if="plan" class="message-media-collage" :style="boxStyle">
    <MessageMediaCollageCell
      v-for="(cell, i) in plan.cells"
      :key="`${cell.item.url}-${i}`"
      :item="cell.item"
      :fit="cell.fit"
      :overflow-count="cell.overflowCount"
      :style="{ gridColumn: cell.gridColumn, gridRow: cell.gridRow }"
      @open="emit('open', cell.item.url)"
    />
  </div>
</template>

<style scoped lang="scss">
.message-media-collage {
  display: grid;
  gap: 3px;
  margin-top: 0.25rem;
  border-radius: 0.6rem;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg) 60%, black);
}
</style>
