<script setup lang="ts">
import { computed } from 'vue';
import {
  LEGAL_DOC_TABS,
  type LegalDocTabId,
} from '@/features/settings/legalDocs';
import { renderLegalMarkdown } from '@/features/settings/renderLegalMarkdown';
import { withBasePath } from '@/features/layout/urlNavigation';

const props = defineProps<{
  docId: LegalDocTabId;
}>();

const base = import.meta.env.BASE_URL || '/';

const tabMeta = computed(() =>
  LEGAL_DOC_TABS.find((t) => t.id === props.docId),
);

const title = computed(() => tabMeta.value?.label ?? 'Legal');

const activeHtml = computed(() =>
  renderLegalMarkdown(tabMeta.value?.markdown ?? ''),
);

function docHref(id: LegalDocTabId): string {
  return withBasePath(`/legal/${id}`, base);
}
</script>

<template>
  <div class="legal-standalone">
    <header class="legal-standalone__top">
      <a
        class="legal-standalone__brand"
        :href="withBasePath('/', base)"
        aria-label="Back to Echo"
      >
        <span class="legal-standalone__brand-name">Echo</span>
      </a>
      <nav class="legal-standalone__switch" aria-label="Legal documents">
        <a
          v-for="tab in LEGAL_DOC_TABS"
          :key="tab.id"
          :href="docHref(tab.id)"
          class="legal-standalone__switch-link"
          :aria-current="tab.id === docId ? 'page' : undefined"
        >
          {{ tab.label }}
        </a>
      </nav>
    </header>

    <main class="legal-standalone__main">
      <h1 class="legal-standalone__title">{{ title }}</h1>
      <div class="legal-standalone__panel custom-scrollbar">
        <div class="legal-md" v-html="activeHtml" />
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.legal-standalone {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

.legal-standalone__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.legal-standalone__brand {
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  text-decoration: none;
}

.legal-standalone__brand:hover,
.legal-standalone__brand:focus-visible {
  color: var(--accent);
}

.legal-standalone__switch {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
}

.legal-standalone__switch-link {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--muted);
  text-decoration: none;
}

.legal-standalone__switch-link:hover,
.legal-standalone__switch-link:focus-visible {
  color: var(--accent);
}

.legal-standalone__switch-link[aria-current='page'] {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.legal-standalone__main {
  width: 100%;
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.75rem 1.25rem 3rem;
  flex: 1;
}

.legal-standalone__title {
  margin: 0 0 1.25rem;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.legal-standalone__panel {
  border-radius: 1rem;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 1.25rem 1.35rem;
  max-height: min(70vh, 720px);
  overflow-y: auto;
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
