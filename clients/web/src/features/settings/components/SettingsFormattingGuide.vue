<script setup lang="ts">
import { computed } from 'vue';
import { FORMATTING_GUIDE_TABS } from '@/features/settings/formattingGuideDocs';
import { parseMessageContent } from '@/features/chat/markdown/useMarkdown';
import SettingsDocTabbedView from '@/features/settings/components/SettingsDocTabbedView.vue';

/** Short live samples so KaTeX behavior matches chat (legal markdown has no math). */
const latexPreviewHtml = computed(() => {
  const samples = [
    'Inline: \\(a^2 + b^2 = c^2\\)',
    '$$\\sum_{k=1}^n k = \\frac{n(n+1)}{2}$$',
  ].join('\n\n');
  return parseMessageContent(samples);
});
</script>

<template>
  <SettingsDocTabbedView
    root-class="settings-formatting-guide"
    ariaLabel="Message formatting guide"
    :tabs="FORMATTING_GUIDE_TABS"
  >
    <template #after="{ activeTabId }">
      <div
        v-if="activeTabId === 'latex'"
        class="settings-formatting-guide__preview mt-6 border-t border-[var(--border)] pt-5"
      >
        <h3 class="mb-2 text-sm font-semibold text-foreground">Live preview</h3>
        <p class="mb-3 text-sm text-muted">
          Rendered the same way as chat messages (KaTeX + sanitizer).
        </p>
        <div
          class="message-content legal-md-preview rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
          v-html="latexPreviewHtml"
        />
      </div>
    </template>
  </SettingsDocTabbedView>
</template>
