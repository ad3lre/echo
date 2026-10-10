<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  docxLoadErrorMessage,
  loadDocxHtmlFromUrl,
} from '@/features/docx/loadDocxFromUrl';
import { openExternal } from '@/platform/desktopBridge';

const props = defineProps<{
  url: string;
  documentLabel: string;
  downloadUrl?: string;
  downloadFilename?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const loading = ref(true);
const loadError = ref<string | null>(null);
const html = ref('');

let loadGeneration = 0;

async function loadDocument() {
  const gen = ++loadGeneration;
  const url = props.url?.trim();
  if (!url) {
    loading.value = false;
    loadError.value = 'Missing document URL.';
    html.value = '';
    return;
  }

  loading.value = true;
  loadError.value = null;
  html.value = '';

  try {
    const content = await loadDocxHtmlFromUrl(url);
    if (gen !== loadGeneration) return;
    html.value = content;
    loading.value = false;
  } catch (e) {
    if (gen !== loadGeneration) return;
    loadError.value = docxLoadErrorMessage(e);
    loading.value = false;
  }
}

function openInBrowser() {
  const u = props.downloadUrl?.trim() || props.url?.trim();
  if (!u) return;
  void openExternal(u);
}

watch(
  () => props.url,
  () => {
    void loadDocument();
  },
  { immediate: true },
);

onUnmounted(() => {
  loadGeneration++;
});
</script>

<template>
  <div class="docx-viewer relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div
      class="viewer-btn-group absolute right-4 top-4 z-20 flex items-center gap-0.5 rounded-lg px-1 py-1"
    >
      <a
        v-if="downloadUrl"
        :href="downloadUrl"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        :download="downloadFilename"
        :title="`Download ${documentLabel}`"
        :aria-label="`Download ${documentLabel}`"
        @click.stop
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      </a>
      <button
        type="button"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        title="Open in browser"
        aria-label="Open in browser"
        @click="openInBrowser"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
      <button
        type="button"
        class="viewer-icon-btn rounded-full p-2 transition-colors"
        aria-label="Close"
        title="Close"
        @click="emit('close')"
      >
        <svg
          class="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div
      class="viewer-counter absolute left-4 top-4 z-20 max-w-[min(70vw,28rem)] truncate px-3 py-1.5 text-sm text-fg"
      :title="documentLabel"
    >
      {{ documentLabel }}
    </div>

    <div
      v-if="loading"
      class="flex flex-1 flex-col items-center justify-center gap-2 p-8"
    >
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span class="text-xs text-fg-subtle">Loading document…</span>
    </div>
    <div
      v-else-if="loadError"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p class="max-w-md text-sm text-fg-soft">{{ loadError }}</p>
      <button
        type="button"
        class="viewer-icon-btn rounded-lg px-3 py-2 text-sm"
        @click="openInBrowser"
      >
        Open in browser
      </button>
    </div>
    <div
      v-else
      class="docx-viewer-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-14 md:px-8 md:pt-16"
    >
      <article
        class="docx-viewer-content mx-auto max-w-3xl rounded-xl border border-border bg-glass-1 px-6 py-8 shadow-lg md:px-10 md:py-10"
        v-html="html"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/DocxDocumentViewer.scss"></style>
