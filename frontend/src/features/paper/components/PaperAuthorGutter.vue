<script setup lang="ts">
import { computed } from 'vue';
import type { PaperAuthorSegment } from '@/features/paper/composables/computePaperAuthorSegments';
import { paperAuthorColor } from '@/features/paper/composables/usePaperAuthorGutter';

const props = defineProps<{
  segments: PaperAuthorSegment[];
  selectedSegmentId: string | null;
  resolveUserName: (userId: string) => string;
  resolveUserAvatar: (userId: string) => string | undefined;
  /** When set, shows who is actively editing a block (line lock). */
  lockOwnerName?: (paperBlockId: string) => string | null;
}>();

const emit = defineEmits<{
  selectSegment: [segment: PaperAuthorSegment];
}>();

const sorted = computed(() =>
  [...props.segments].sort((a, b) => a.top - b.top),
);

function segmentTitle(segment: PaperAuthorSegment): string {
  const names = segment.authorIds.map((id) => props.resolveUserName(id));
  if (segment.sharedCredit && names.length >= 2) {
    return `${names[0]} & ${names[1]}`;
  }
  return names[0] ?? '';
}

function lockLabel(segment: PaperAuthorSegment): string | null {
  if (!props.lockOwnerName) return null;
  for (const id of segment.paperBlockIds) {
    const name = props.lockOwnerName(id);
    if (name) return name;
  }
  return null;
}

function onSelect(segment: PaperAuthorSegment) {
  emit('selectSegment', segment);
}
</script>

<template>
  <div class="relative w-12 shrink-0" role="list" aria-label="Document authors">
    <div
      v-for="segment in sorted"
      :key="segment.segmentId"
      class="absolute left-0 flex w-10 items-start justify-center"
      :style="{
        top: `${segment.top}px`,
        minHeight: `${Math.max(segment.height, 24)}px`,
      }"
      role="listitem"
    >
      <button
        type="button"
        class="paper-gutter-segment-trigger group relative flex flex-col items-center border-0 bg-transparent p-0"
        :class="
          selectedSegmentId === segment.segmentId
            ? 'paper-gutter-segment-trigger--selected'
            : ''
        "
        :aria-label="`Highlight text by ${segmentTitle(segment)}`"
        :aria-pressed="selectedSegmentId === segment.segmentId"
        :title="segmentTitle(segment)"
        @click="onSelect(segment)"
      >
        <span
          v-if="lockLabel(segment)"
          class="paper-gutter-lock-badge mb-0.5 max-w-[2.5rem] truncate rounded px-1 text-[9px] font-medium leading-tight text-white"
          :style="{ backgroundColor: 'var(--accent)' }"
        >
          {{ lockLabel(segment) }}
        </span>
        <div
          v-if="segment.sharedCredit"
          class="relative flex h-7 w-9 items-center justify-center"
        >
          <img
            v-if="resolveUserAvatar(segment.authorIds[0]!)"
            :src="resolveUserAvatar(segment.authorIds[0]!)"
            alt=""
            class="absolute left-0 h-6 w-6 rounded-full border-2"
            :style="{ borderColor: paperAuthorColor(segment.authorIds[0]!) }"
          />
          <div
            v-else
            class="absolute left-0 flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            :style="{
              backgroundColor: paperAuthorColor(segment.authorIds[0]!),
            }"
          >
            {{
              (resolveUserName(segment.authorIds[0]!) || '?')
                .slice(0, 1)
                .toUpperCase()
            }}
          </div>
          <img
            v-if="resolveUserAvatar(segment.authorIds[1]!)"
            :src="resolveUserAvatar(segment.authorIds[1]!)"
            alt=""
            class="absolute right-0 h-6 w-6 rounded-full border-2"
            :style="{ borderColor: paperAuthorColor(segment.authorIds[1]!) }"
          />
          <div
            v-else
            class="absolute right-0 flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            :style="{
              backgroundColor: paperAuthorColor(segment.authorIds[1]!),
            }"
          >
            {{
              (resolveUserName(segment.authorIds[1]!) || '?')
                .slice(0, 1)
                .toUpperCase()
            }}
          </div>
        </div>
        <template v-else>
          <img
            v-if="resolveUserAvatar(segment.authorIds[0]!)"
            :src="resolveUserAvatar(segment.authorIds[0]!)"
            alt=""
            class="h-7 w-7 rounded-full border-2"
            :style="{
              borderColor: paperAuthorColor(segment.authorIds[0]!),
            }"
          />
          <div
            v-else
            class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            :style="{
              backgroundColor: paperAuthorColor(segment.authorIds[0]!),
            }"
          >
            {{
              (resolveUserName(segment.authorIds[0]!) || '?')
                .slice(0, 1)
                .toUpperCase()
            }}
          </div>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-gutter-segment-trigger {
  cursor: pointer;
  border-radius: 9999px;
  transition: box-shadow 0.15s ease;
}

.paper-gutter-segment-trigger:hover,
.paper-gutter-segment-trigger--selected {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}
</style>
