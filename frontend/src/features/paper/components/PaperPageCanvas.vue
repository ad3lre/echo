<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3';
import type { Editor } from '@tiptap/vue-3';
import type { VNodeRef } from 'vue';
import PaperRawMarkdownSurface from '@/features/paper/components/PaperRawMarkdownSurface.vue';
import type { PaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';

defineProps<{
  editor: Editor | null | undefined;
  loading?: boolean;
  pageRef?: VNodeRef;
  /** CSS font-family stack for the page (document default). */
  documentFontFamily?: string;
  pageSurfaceStyle?: Record<string, string>;
  sourceViewMode?: PaperSourceViewMode;
  rawMarkdown?: string;
  rawEditable?: boolean;
}>();

const emit = defineEmits<{
  'update:rawMarkdown': [value: string];
}>();
</script>

<template>
  <div
    class="paper-workspace flex min-h-0 flex-1 justify-center px-4 py-10 md:px-8"
  >
    <div
      v-if="loading"
      class="paper-page paper-page--skeleton w-full max-w-[816px]"
    >
      <div class="paper-page-skeleton-line paper-page-skeleton-line--title" />
      <div class="paper-page-skeleton-line" />
      <div class="paper-page-skeleton-line paper-page-skeleton-line--short" />
      <div class="paper-page-skeleton-line" />
      <div class="paper-page-skeleton-line" />
    </div>
    <div
      v-else
      :ref="pageRef"
      class="paper-page w-full max-w-[816px]"
      :class="{ 'paper-page--raw': sourceViewMode === 'raw' }"
      :style="{
        ...(documentFontFamily
          ? { '--paper-doc-font': documentFontFamily }
          : {}),
        ...(pageSurfaceStyle ?? {}),
      }"
    >
      <div
        v-show="sourceViewMode !== 'raw'"
        class="paper-page__wysiwyg"
        :aria-hidden="sourceViewMode === 'raw' ? 'true' : undefined"
      >
        <EditorContent :editor="editor ?? undefined" />
      </div>
      <slot v-if="sourceViewMode !== 'raw'" />
      <PaperRawMarkdownSurface
        v-if="sourceViewMode === 'raw'"
        :model-value="rawMarkdown ?? ''"
        :editable="rawEditable !== false"
        @update:model-value="emit('update:rawMarkdown', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.paper-page--skeleton {
  padding: 2.5rem 2rem;
}

.paper-page-skeleton-line {
  height: 0.75rem;
  margin-bottom: 0.75rem;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--paper-surface-fg) 6%, transparent) 0%,
    color-mix(in srgb, var(--paper-surface-fg) 12%, transparent) 50%,
    color-mix(in srgb, var(--paper-surface-fg) 6%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: paper-skeleton-shimmer 1.2s ease-in-out infinite;
}

.paper-page-skeleton-line--title {
  height: 1.25rem;
  width: 45%;
  margin-bottom: 1.5rem;
}

.paper-page-skeleton-line--short {
  width: 70%;
}

.paper-page__wysiwyg[aria-hidden='true'] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  pointer-events: none;
}

@keyframes paper-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
