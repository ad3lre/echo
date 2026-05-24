<script setup lang="ts">
import { computed } from 'vue';
import type { PaperGutterRow } from '@/features/paper/composables/usePaperAuthorGutter';
import { paperAuthorColor } from '@/features/paper/composables/usePaperAuthorGutter';

const props = defineProps<{
  rows: PaperGutterRow[];
  resolveUserName: (userId: string) => string;
  resolveUserAvatar: (userId: string) => string | undefined;
  /** When set, shows who is actively editing a block (line lock). */
  lockOwnerName?: (paperBlockId: string) => string | null;
}>();

const sorted = computed(() => [...props.rows].sort((a, b) => a.top - b.top));
</script>

<template>
  <div class="relative w-12 shrink-0" aria-hidden="true">
    <div
      v-for="row in sorted"
      :key="row.paperBlockId"
      class="absolute left-0 flex w-10 items-start justify-center"
      :style="{
        top: `${row.top}px`,
        minHeight: `${Math.max(row.height, 24)}px`,
      }"
    >
      <div
        class="group relative flex flex-col items-center"
        :title="
          lockOwnerName?.(row.paperBlockId) ?? resolveUserName(row.authorId)
        "
      >
        <span
          v-if="lockOwnerName?.(row.paperBlockId)"
          class="paper-gutter-lock-badge mb-0.5 max-w-[2.5rem] truncate rounded px-1 text-[9px] font-medium leading-tight text-white"
          :style="{
            backgroundColor: 'var(--accent)',
          }"
        >
          {{ lockOwnerName(row.paperBlockId) }}
        </span>
        <img
          v-if="resolveUserAvatar(row.authorId)"
          :src="resolveUserAvatar(row.authorId)"
          alt=""
          class="h-7 w-7 rounded-full border-2"
          :style="{ borderColor: paperAuthorColor(row.authorId) }"
        />
        <div
          v-else
          class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          :style="{ backgroundColor: paperAuthorColor(row.authorId) }"
        >
          {{ (resolveUserName(row.authorId) || '?').slice(0, 1).toUpperCase() }}
        </div>
      </div>
    </div>
  </div>
</template>
