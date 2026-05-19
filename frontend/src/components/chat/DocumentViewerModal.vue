<script setup lang="ts">
import {
  ref,
  watch,
  computed,
  toRef,
  onMounted,
  onUnmounted,
  defineAsyncComponent,
} from 'vue';
import type { MessageAttachmentPayload } from '@shared/types';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { openExternal } from '@/platform/desktopBridge';
import { attachmentSaveLinkAttrs } from '@/utils/attachmentSaveLinkAttrs';

const PdfDocumentViewer = defineAsyncComponent(() =>
  import('./PdfDocumentViewer.vue'),
);

const props = defineProps<{
  modelValue: boolean;
  document: MessageAttachmentPayload | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const iframeLoading = ref(true);

function isPdf(att: MessageAttachmentPayload): boolean {
  const m = (att.mimeType ?? '').toLowerCase();
  if (m === 'application/pdf') return true;
  const n = (att.filename ?? '').toLowerCase();
  return n.endsWith('.pdf');
}

const useNativePdf = computed(
  () =>
    !!props.document?.url?.trim() &&
    isPdf(props.document),
);

const iframeSrc = computed(() => {
  const att = props.document;
  if (!att?.url?.trim()) return '';
  const url = att.url.trim();
  if (isPdf(att)) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
});

const title = computed(
  () =>
    props.document?.filename?.trim() ||
    (props.document && isPdf(props.document) ? 'PDF' : 'Document'),
);

const saveLinkAttrs = computed(() =>
  attachmentSaveLinkAttrs(props.document?.url?.trim() ?? '', title.value),
);

watch(
  () => [props.modelValue, props.document?.url, useNativePdf.value] as const,
  () => {
    if (props.modelValue && props.document?.url) {
      iframeLoading.value = !useNativePdf.value;
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

function onIframeLoad() {
  iframeLoading.value = false;
}

function openInBrowser() {
  const u = props.document?.url?.trim();
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
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && document"
      class="fixed inset-0 z-[70] flex flex-col bg-black/80 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        :aria-label="`Document: ${title}`"
        class="flex h-full min-h-0 w-full flex-col bg-[var(--echo-chat-view-bg)] shadow-2xl md:mx-auto md:my-4 md:max-h-[calc(100vh-2rem)] md:max-w-6xl md:rounded-xl md:border md:border-border"
        @click.stop
      >
        <header
          class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5"
        >
          <div class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {{ title }}
          </div>
          <a
            v-if="document.url"
            :href="document.url"
            class="chat-focus-ring shrink-0 rounded-md border border-border bg-glass-2 px-2.5 py-1.5 text-xs font-medium text-fg-soft hover:bg-glass-hover"
            :download="saveLinkAttrs.download"
            :target="saveLinkAttrs.target"
            :rel="saveLinkAttrs.rel"
            @click.stop
          >
            Download
          </a>
          <button
            v-if="document.url"
            type="button"
            class="chat-focus-ring shrink-0 rounded-md border border-border bg-glass-2 px-2.5 py-1.5 text-xs font-medium text-fg-soft hover:bg-glass-hover"
            @click="openInBrowser"
          >
            Open
          </button>
          <button
            type="button"
            class="chat-focus-ring shrink-0 rounded-md p-2 text-fg-soft hover:bg-glass-hover hover:text-fg"
            aria-label="Close"
            @click="close"
          >
            <svg
              class="h-5 w-5"
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
        </header>
        <div class="relative flex min-h-0 flex-1 flex-col bg-surface">
          <PdfDocumentViewer
            v-if="useNativePdf"
            :key="document.url"
            class="min-h-0 flex-1"
            :url="document.url!.trim()"
            :document-label="title"
          />
          <template v-else>
            <div
              v-if="iframeLoading"
              class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface"
            >
              <div
                class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
              />
              <span class="text-xs text-fg-subtle">Loading preview…</span>
            </div>
            <iframe
              v-if="iframeSrc"
              :key="iframeSrc"
              :src="iframeSrc"
              class="h-full min-h-[50vh] w-full flex-1 border-0 md:min-h-0"
              title="Document preview"
              referrerpolicy="no-referrer-when-downgrade"
              @load="onIframeLoad"
            />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
