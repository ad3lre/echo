<script setup lang="ts">
import {
  ref,
  watch,
  computed,
  toRef,
  onMounted,
  onUnmounted,
  onErrorCaptured,
  defineAsyncComponent,
} from 'vue';
import type { MessageAttachmentPayload } from '@shared/types';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { openExternal } from '@/platform/desktopBridge';
import { attachmentSaveLinkAttrs } from '@/utils/attachmentSaveLinkAttrs';
import {
  isDocxAttachment,
  isLegacyDocAttachment,
  isPdfAttachment,
} from '@/utils/documentAttachmentKind';

const PdfDocumentViewer = defineAsyncComponent({
  loader: () => import('./PdfDocumentViewer.vue'),
  onError(error, retry, fail, attempts) {
    if (import.meta.env.DEV) {
      console.error('[DocumentViewerModal] PDF viewer failed to load', error);
    }
    if (attempts <= 1) retry();
    else fail();
  },
});
const DocxDocumentViewer = defineAsyncComponent({
  loader: () => import('./DocxDocumentViewer.vue'),
  onError(error, retry, fail, attempts) {
    if (import.meta.env.DEV) {
      console.error('[DocumentViewerModal] DOCX viewer failed to load', error);
    }
    if (attempts <= 1) retry();
    else fail();
  },
});

const props = defineProps<{
  modelValue: boolean;
  /** Attachment being previewed (not named `document` — avoids shadowing `window.document` in templates). */
  attachment: MessageAttachmentPayload | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const iframeLoading = ref(true);
const iframeError = ref<string | null>(null);
let iframeLoadTimer: ReturnType<typeof setTimeout> | undefined;

const useNativePdf = computed(
  () => !!props.attachment?.url?.trim() && isPdfAttachment(props.attachment),
);

const useNativeDocx = computed(
  () => !!props.attachment?.url?.trim() && isDocxAttachment(props.attachment),
);

const useOfficeIframe = computed(() => {
  const att = props.attachment;
  if (!att?.url?.trim()) return false;
  if (useNativePdf.value || useNativeDocx.value) return false;
  return isLegacyDocAttachment(att);
});

const iframeSrc = computed(() => {
  const att = props.attachment;
  if (!att?.url?.trim() || !useOfficeIframe.value) return '';
  const url = att.url.trim();
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
});

const title = computed(() => {
  const att = props.attachment;
  if (!att) return 'Document';
  return (
    att.filename?.trim() ||
    (isPdfAttachment(att)
      ? 'PDF'
      : isDocxAttachment(att)
        ? 'Document'
        : 'Document')
  );
});

const documentUrl = computed(() => props.attachment?.url?.trim() ?? '');

const saveLinkAttrs = computed(() =>
  attachmentSaveLinkAttrs(documentUrl.value, title.value),
);

function clearIframeLoadTimer() {
  if (iframeLoadTimer !== undefined) {
    clearTimeout(iframeLoadTimer);
    iframeLoadTimer = undefined;
  }
}

function resetIframeState() {
  clearIframeLoadTimer();
  iframeLoading.value = false;
  iframeError.value = null;
}

watch(
  () =>
    [
      props.modelValue,
      props.attachment?.url,
      useNativePdf.value,
      useNativeDocx.value,
      useOfficeIframe.value,
    ] as const,
  () => {
    clearIframeLoadTimer();
    iframeError.value = null;
    if (!props.modelValue || !props.attachment?.url) {
      iframeLoading.value = false;
      return;
    }
    if (useOfficeIframe.value) {
      iframeLoading.value = true;
      iframeLoadTimer = setTimeout(() => {
        if (iframeLoading.value) {
          iframeLoading.value = false;
          iframeError.value =
            'Preview timed out. The file may require a public URL, or your browser blocked the embed. Try Download or Open.';
        }
      }, 45_000);
      return;
    }
    iframeLoading.value = false;
  },
);

function close() {
  emit('update:modelValue', false);
}

function onIframeLoad() {
  clearIframeLoadTimer();
  iframeLoading.value = false;
}

function onIframeError() {
  clearIframeLoadTimer();
  iframeLoading.value = false;
  iframeError.value =
    'Could not load the document preview. Try Download or Open.';
}

function openInBrowser() {
  const u = documentUrl.value;
  if (!u) return;
  void openExternal(u);
}

function onDocKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onDocKeydown);
  resetIframeState();
});

/** Keep viewer failures inside the modal instead of ChatView's error boundary. */
onErrorCaptured(() => false);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && attachment"
      ref="modalRef"
      class="document-viewer-modal fixed inset-0 z-[70] flex flex-col bg-overlay-ink"
      role="dialog"
      aria-modal="true"
      :aria-label="`Document: ${title}`"
      @click.self="close"
    >
      <PdfDocumentViewer
        v-if="useNativePdf"
        :key="attachment.url"
        class="min-h-0 flex-1"
        :url="documentUrl"
        :document-label="title"
        :download-url="documentUrl"
        :download-filename="saveLinkAttrs.download"
        @close="close"
      />
      <DocxDocumentViewer
        v-else-if="useNativeDocx"
        :key="attachment.url"
        class="min-h-0 flex-1"
        :url="documentUrl"
        :document-label="title"
        :download-url="documentUrl"
        :download-filename="saveLinkAttrs.download"
        @close="close"
      />
      <template v-else-if="useOfficeIframe">
        <div
          class="viewer-btn-group absolute right-4 top-4 z-20 flex items-center gap-0.5 rounded-lg px-1 py-1"
        >
          <a
            v-if="documentUrl"
            :href="documentUrl"
            class="viewer-icon-btn rounded-full p-2 transition-colors"
            :download="saveLinkAttrs.download"
            :target="saveLinkAttrs.target"
            :rel="saveLinkAttrs.rel"
            title="Download"
            aria-label="Download"
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
            @click="close"
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
          :title="title"
        >
          {{ title }}
        </div>
        <div class="relative flex min-h-0 flex-1 flex-col">
          <div
            v-if="iframeLoading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2"
          >
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
            />
            <span class="text-xs text-fg-subtle">Loading preview…</span>
          </div>
          <div
            v-else-if="iframeError"
            class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p class="max-w-md text-sm text-fg-soft">{{ iframeError }}</p>
            <button
              type="button"
              class="viewer-icon-btn rounded-lg px-3 py-2 text-sm"
              @click="openInBrowser"
            >
              Open in browser
            </button>
          </div>
          <iframe
            v-if="iframeSrc && !iframeError"
            :key="iframeSrc"
            :src="iframeSrc"
            class="h-full min-h-0 w-full flex-1 border-0"
            title="Document preview"
            referrerpolicy="no-referrer-when-downgrade"
            @load="onIframeLoad"
            @error="onIframeError"
          />
        </div>
      </template>
      <div
        v-else
        class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <p class="max-w-md text-sm text-fg-soft">
          This document type cannot be previewed in Echo. Try Download or Open.
        </p>
        <button
          type="button"
          class="viewer-icon-btn rounded-lg px-3 py-2 text-sm"
          @click="openInBrowser"
        >
          Open in browser
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.document-viewer-modal .viewer-btn-group,
.document-viewer-modal .viewer-counter {
  background: var(--vue-auto-069);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  box-shadow: inset 0 1px 0 var(--vue-auto-010);
}

.document-viewer-modal .viewer-icon-btn {
  background: transparent;
  border: none;
  color: var(--vue-auto-009);
  transition:
    background 0.15s,
    color 0.15s;
}

.document-viewer-modal .viewer-icon-btn:hover {
  background: var(--vue-auto-003);
  color: var(--vue-auto-006);
}
</style>
