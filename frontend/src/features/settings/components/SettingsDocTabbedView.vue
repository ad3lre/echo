<script setup lang="ts">
import { computed, ref } from 'vue';
import { renderLegalMarkdown } from '@/features/settings/renderLegalMarkdown';

export type SettingsDocTab = {
  id: string;
  label: string;
  markdown: string;
};

const props = defineProps<{
  /** Root wrapper class for layout-specific tweaks (e.g. `settings-legal`). */
  rootClass: string;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  tabs: readonly SettingsDocTab[];
}>();

const activeTab = ref(props.tabs[0]?.id ?? '');

const activeMarkdown = computed(() => {
  const tab = props.tabs.find((t) => t.id === activeTab.value);
  return tab?.markdown ?? '';
});

const activeHtml = computed(() => renderLegalMarkdown(activeMarkdown.value));

function panelId(id: string) {
  return `settings-doc-panel-${id}`;
}

function tabId(id: string) {
  return `settings-doc-tab-${id}`;
}
</script>

<template>
  <div :class="[rootClass, 'settings-doc-tabbed flex flex-col gap-4']">
    <div
      role="tablist"
      :aria-label="ariaLabel"
      class="settings-doc-tabbed__tabs flex flex-wrap gap-1 rounded-xl p-1"
    >
      <button
        v-for="tab in tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="panelId(tab.id)"
        :tabindex="activeTab === tab.id ? 0 : -1"
        class="settings-doc-tabbed__tab rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
        :class="
          activeTab === tab.id
            ? 'settings-doc-tabbed__tab--active'
            : 'text-muted hover:bg-glass-hover hover:text-foreground'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      class="settings-card settings-doc-tabbed__panel custom-scrollbar max-h-[min(520px,55vh)] overflow-y-auto rounded-2xl p-5"
    >
      <div
        :id="panelId(activeTab)"
        role="tabpanel"
        :aria-labelledby="tabId(activeTab)"
        tabindex="0"
      >
        <div class="legal-md" v-html="activeHtml" />
        <slot name="after" :active-tab-id="activeTab" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-doc-tabbed__tabs {
  background: var(--surface);
  border: 1px solid var(--border);
}

.settings-doc-tabbed__tab--active {
  background: var(--set-nav-active-grad);
  color: var(--set-nav-active-fg);
  box-shadow: inset 0 0 0 1px var(--set-nav-active-ring);
}

.legal-md {
  color: var(--foreground);
  font-size: 0.875rem;
  line-height: 1.6;

  :deep(h1),
  :deep(h2) {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 1.25rem 0 0.5rem;
    color: var(--foreground);
  }

  :deep(h1:first-child),
  :deep(h2:first-child) {
    margin-top: 0;
  }

  :deep(h3) {
    font-size: 1rem;
    font-weight: 650;
    margin: 1rem 0 0.35rem;
    color: var(--foreground);
  }

  :deep(p) {
    margin: 0.5rem 0;
    color: var(--muted);
  }

  :deep(ul),
  :deep(ol) {
    margin: 0.5rem 0 0.5rem 1.25rem;
    color: var(--muted);
  }

  :deep(li) {
    margin: 0.25rem 0;
  }

  :deep(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :deep(hr) {
    margin: 1rem 0;
    border: 0;
    border-top: 1px solid var(--border);
  }

  :deep(strong) {
    color: var(--foreground);
    font-weight: 650;
  }

  :deep(blockquote) {
    margin: 0.75rem 0;
    padding-left: 0.75rem;
    border-left: 3px solid var(--border);
    color: var(--muted);
  }

  :deep(code) {
    font-size: 0.8125em;
    padding: 0.1em 0.35em;
    border-radius: 0.25rem;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  :deep(pre) {
    margin: 0.75rem 0;
    padding: 0.75rem;
    overflow-x: auto;
    border-radius: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  :deep(pre code) {
    padding: 0;
    background: transparent;
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.8125rem;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid var(--border);
    padding: 0.35rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }

  :deep(th) {
    font-weight: 650;
    color: var(--foreground);
    background: var(--surface);
  }
}
</style>
