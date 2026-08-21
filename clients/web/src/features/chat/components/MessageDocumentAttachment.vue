<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { MessageAttachmentPayload } from '@shared/types';
import { observeChatMediaRetentionVisible } from '@/features/chat/composables/useChatMediaRetentionTouch';
import { attachmentSaveLinkAttrs } from '@/features/chat/composables/attachmentSaveLinkAttrs';
import PdfFirstPagePreview from './PdfFirstPagePreview.vue';

const props = defineProps<{
  attachment: MessageAttachmentPayload;
}>();

const emit = defineEmits<{
  open: [];
}>();

const isPdf = computed(() => {
  const m = (props.attachment.mimeType ?? '').toLowerCase();
  if (m === 'application/pdf') return true;
  const n = (props.attachment.filename ?? '').toLowerCase();
  return n.endsWith('.pdf');
});

const stripeClass = computed(() =>
  isPdf.value ? 'bg-red-500/90' : 'bg-blue-600/90',
);

const label = computed(() => (isPdf.value ? 'PDF' : 'DOC'));

function formatBytes(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const sizeLabel = computed(() => formatBytes(props.attachment.fileSize));

const displayName = computed(
  () =>
    props.attachment.filename?.trim() ||
    (isPdf.value ? 'Document.pdf' : 'Document'),
);

const saveLinkAttrs = computed(() =>
  attachmentSaveLinkAttrs(
    props.attachment.url?.trim() ?? '',
    displayName.value,
  ),
);

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  stopObserve = observeChatMediaRetentionVisible(
    rootRef.value,
    props.attachment.storageKey,
  );
});

onUnmounted(() => {
  stopObserve?.();
});

const pdfPreviewSrc = computed(() => props.attachment.url?.trim() ?? '');
</script>

<template>
  <div
    ref="rootRef"
    class="message-document-card group relative flex min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-glass-1 shadow-sm"
    :class="[
      isPdf ? 'max-w-md' : 'max-w-sm',
      attachment.spoiler ? 'ring-2 ring-amber-500/70' : '',
    ]"
  >
    <div class="w-1 shrink-0" :class="stripeClass" aria-hidden="true" />
    <button
      v-if="isPdf && pdfPreviewSrc"
      type="button"
      class="chat-focus-ring shrink-0 self-start border-0 bg-transparent p-0 text-left"
      :title="`Preview ${displayName}`"
      @click="emit('open')"
    >
      <PdfFirstPagePreview
        :src="pdfPreviewSrc"
        :spoiler="!!attachment.spoiler"
      />
    </button>
    <div
      v-else-if="isPdf"
      class="mx-2.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center self-center rounded-md bg-glass-2 text-[10px] font-bold uppercase leading-tight text-fg-soft"
      title="PDF"
    >
      <span>{{ label }}</span>
    </div>
    <div
      v-else
      class="mx-2.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center self-center rounded-md bg-glass-2 text-[10px] font-bold uppercase leading-tight text-fg-soft"
      title="Word"
    >
      <span>{{ label }}</span>
    </div>
    <div class="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5 py-2">
      <div class="min-w-0 flex-1">
        <div
          class="truncate text-xs font-semibold text-fg"
          :class="attachment.spoiler ? 'blur-[3px] select-none' : ''"
          :title="displayName"
        >
          {{ displayName }}
        </div>
        <div
          v-if="sizeLabel"
          class="mt-0.5 text-[10px] uppercase tracking-wide text-fg-subtle"
          :class="attachment.spoiler ? 'blur-[2px]' : ''"
        >
          {{ sizeLabel }}
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-1">
        <a
          :href="attachment.url"
          class="chat-focus-ring rounded-md border border-border bg-glass-2 px-2 py-1 text-[11px] font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
          :download="saveLinkAttrs.download"
          :target="saveLinkAttrs.target"
          :rel="saveLinkAttrs.rel"
          :title="`Download ${displayName}`"
          @click.stop
        >
          Save
        </a>
        <button
          type="button"
          class="chat-focus-ring rounded-md border border-accent/40 bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25"
          @click="emit('open')"
        >
          View
        </button>
      </div>
    </div>
  </div>
</template>
