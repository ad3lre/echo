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
          class="paper-gutter-avatar-wrap paper-gutter-avatar-wrap--pair relative flex h-7 w-9 shrink-0 items-center justify-center"
        >
          <div
            class="paper-gutter-avatar paper-gutter-avatar--sm absolute left-0 overflow-hidden rounded-full border-2"
            :style="{ borderColor: paperAuthorColor(segment.authorIds[0]!) }"
          >
            <img
              v-if="resolveUserAvatar(segment.authorIds[0]!)"
              :src="resolveUserAvatar(segment.authorIds[0]!)"
              alt=""
              class="paper-gutter-avatar__img"
            />
            <div
              v-else
              class="paper-gutter-avatar__fallback"
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
          </div>
          <div
            class="paper-gutter-avatar paper-gutter-avatar--sm absolute right-0 overflow-hidden rounded-full border-2"
            :style="{ borderColor: paperAuthorColor(segment.authorIds[1]!) }"
          >
            <img
              v-if="resolveUserAvatar(segment.authorIds[1]!)"
              :src="resolveUserAvatar(segment.authorIds[1]!)"
              alt=""
              class="paper-gutter-avatar__img"
            />
            <div
              v-else
              class="paper-gutter-avatar__fallback"
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
        </div>
        <div v-else class="paper-gutter-avatar-wrap shrink-0">
          <div
            class="paper-gutter-avatar paper-gutter-avatar--md overflow-hidden rounded-full border-2"
            :style="{
              borderColor: paperAuthorColor(segment.authorIds[0]!),
            }"
          >
            <img
              v-if="resolveUserAvatar(segment.authorIds[0]!)"
              :src="resolveUserAvatar(segment.authorIds[0]!)"
              alt=""
              class="paper-gutter-avatar__img"
            />
            <div
              v-else
              class="paper-gutter-avatar__fallback paper-gutter-avatar__fallback--md"
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
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-gutter-segment-trigger {
  cursor: pointer;
}

.paper-gutter-avatar-wrap {
  border-radius: 9999px;
  transition: box-shadow 0.15s ease;
}

.paper-gutter-segment-trigger:hover .paper-gutter-avatar-wrap,
.paper-gutter-segment-trigger--selected .paper-gutter-avatar-wrap {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

.paper-gutter-avatar {
  box-sizing: border-box;
  flex-shrink: 0;
}

.paper-gutter-avatar--sm {
  width: 1.5rem;
  height: 1.5rem;
}

.paper-gutter-avatar--md {
  width: 1.75rem;
  height: 1.75rem;
}

.paper-gutter-avatar__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.paper-gutter-avatar__fallback {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  font-size: 0.5625rem;
  font-weight: 600;
  color: #fff;
}

.paper-gutter-avatar__fallback--md {
  font-size: 0.625rem;
}
</style>
