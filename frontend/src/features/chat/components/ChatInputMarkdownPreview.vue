<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  markdownPreviewOpen: boolean;
  hasComposerContent: boolean;
  markdownPreviewExpanded: boolean;
  markdownPreviewInline: boolean;
  markdownPreviewHtml: string;
}>();

const markdownPreviewContentRef = ref<HTMLDivElement | null>(null);

defineExpose({
  markdownPreviewContentRef,
});
</script>

<template>
  <div
    v-if="
      markdownPreviewOpen &&
      hasComposerContent &&
      !markdownPreviewExpanded &&
      !markdownPreviewInline
    "
    class="markdown-preview mb-2 rounded-lg overflow-hidden flex flex-col"
  >
    <div
      class="markdown-preview-inner relative bg-transparent px-3 py-3 flex flex-col min-h-0 max-h-[250px] overflow-hidden"
    >
      <div
        class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted shrink-0"
      >
        Markdown preview
      </div>
      <div
        ref="markdownPreviewContentRef"
        v-spoiler-reveal
        class="markdown-preview__content text-sm break-words overflow-y-auto custom-scrollbar min-h-0 flex-1"
        v-html="markdownPreviewHtml"
      />
    </div>
  </div>
</template>
