<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import {
  LEGAL_DOC_TABS,
  type LegalDocTabId,
} from '@/features/settings/legalDocs';
import { renderLegalMarkdown } from '@/features/settings/renderLegalMarkdown';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    initialTab?: LegalDocTabId;
  }>(),
  {
    initialTab: 'terms',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(
  modalRef,
  computed(() => props.modelValue),
);

const allowedTabs = computed(() =>
  LEGAL_DOC_TABS.filter((tab) => tab.id === 'terms' || tab.id === 'privacy'),
);

const activeTab = ref<LegalDocTabId>('terms');

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const preferred =
      allowedTabs.value.find((tab) => tab.id === props.initialTab)?.id ??
      'terms';
    activeTab.value = preferred;
  },
  { immediate: true },
);

const activeMarkdown = computed(() => {
  const tab = allowedTabs.value.find((t) => t.id === activeTab.value);
  return tab?.markdown ?? '';
});

const activeHtml = computed(() => renderLegalMarkdown(activeMarkdown.value));

function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="legal-modal-overlay fixed inset-0 z-[220] flex items-center justify-center p-4"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      class="legal-modal-panel w-full max-w-3xl rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="legal-modal-title"
            class="text-lg font-semibold text-foreground"
          >
            Legal
          </h2>
          <p class="mt-1 text-sm text-muted">
            Review Terms of Service and Privacy Policy.
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-muted transition hover:bg-elevated hover:text-foreground"
          aria-label="Close legal documents"
          @click="close"
        >
          ✕
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Legal documents"
        class="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-elevated p-1"
      >
        <button
          v-for="tab in allowedTabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-accent text-[var(--accent-contrast-fg)]'
              : 'text-muted hover:bg-glass-hover hover:text-foreground'
          "
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        class="custom-scrollbar max-h-[min(60vh,640px)] overflow-y-auto rounded-xl border border-border bg-panel p-4"
      >
        <div class="legal-md" v-html="activeHtml" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.legal-modal-overlay {
  background: color-mix(in srgb, black 62%, transparent);
  backdrop-filter: blur(10px);
}

.legal-md {
  color: var(--foreground);
  font-size: 0.875rem;
  line-height: 1.6;

  :deep(h1),
  :deep(h2) {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 1.1rem 0 0.5rem;
    color: var(--foreground);
  }

  :deep(h1:first-child),
  :deep(h2:first-child) {
    margin-top: 0;
  }

  :deep(h3) {
    font-size: 0.98rem;
    font-weight: 650;
    margin: 0.9rem 0 0.35rem;
    color: var(--foreground);
  }

  :deep(p),
  :deep(ul),
  :deep(ol) {
    color: var(--muted);
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.5rem 0 0.5rem 1.2rem;
  }

  :deep(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}
</style>
