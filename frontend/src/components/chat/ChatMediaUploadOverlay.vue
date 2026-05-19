<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMediaUploadProgressEvent } from '@/api/echoClient';

const props = defineProps<{
  state: ChatMediaUploadProgressEvent;
}>();

const progressDescription = computed(() => {
  const { phase, kind } = props.state;
  if (phase === 'preparing') {
    return kind === 'image' ? 'Preparing image' : 'Preparing file';
  }
  if (phase === 'checking') {
    return 'Checking upload';
  }
  if (phase === 'uploading') {
    return 'Uploading';
  }
  if (phase === 'finishing') {
    return 'Finalizing';
  }
  return 'Complete';
});

const showDeterminateBar = computed(
  () =>
    props.state.phase === 'uploading' &&
    props.state.uploadPercent !== null &&
    props.state.uploadPercent >= 0,
);

const barWidthPercent = computed(() => {
  if (!showDeterminateBar.value) return 0;
  return Math.max(0, Math.min(100, props.state.uploadPercent ?? 0));
});

const fileLabel = computed(() => {
  const name = props.state.fileName.trim() || 'Attachment';
  return name.length > 56 ? `${name.slice(0, 52)}…` : name;
});

const mediaKindLabel = computed(() => {
  if (props.state.kind === 'video') return 'video';
  if (props.state.kind === 'audio') return 'audio';
  if (props.state.kind === 'document') return 'document';
  return 'image';
});
</script>

<template>
  <div
    class="chat-media-upload-inline mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    role="status"
    aria-live="polite"
    aria-busy="true"
    :aria-label="`Sending ${state.fileIndex + 1} of ${state.fileTotal}: ${state.fileName}`"
  >
    <div class="px-3 py-2.5">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <p
          class="truncate text-[12px] font-medium text-fg"
          :title="state.fileName"
        >
          {{ fileLabel }}
        </p>
        <p class="shrink-0 text-[11px] tabular-nums text-fg-subtle">
          {{ state.fileIndex + 1 }}/{{ state.fileTotal }}
          <span aria-hidden="true">·</span>
          {{ mediaKindLabel }}
        </p>
      </div>

      <div class="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span class="text-fg-subtle">
          {{ progressDescription }}
        </span>
        <span v-if="showDeterminateBar" class="tabular-nums text-fg-subtle">
          {{ barWidthPercent }}%
        </span>
      </div>

      <div
        class="relative h-1.5 overflow-hidden rounded-full bg-glass-2"
        role="progressbar"
        :aria-valuenow="showDeterminateBar ? barWidthPercent : undefined"
        :aria-valuemin="showDeterminateBar ? 0 : undefined"
        :aria-valuemax="showDeterminateBar ? 100 : undefined"
        :aria-label="
          showDeterminateBar ? `Upload ${barWidthPercent}%` : 'Upload progress'
        "
      >
        <div
          v-if="showDeterminateBar"
          class="chat-media-upload-bar-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-150 ease-out"
          :style="{ width: `${barWidthPercent}%` }"
        />
        <div
          v-else
          class="chat-media-upload-bar-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-sky-500/85 to-indigo-500/85"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-media-upload-bar-indeterminate {
  animation: chat-upload-indeterminate 1.1s ease-in-out infinite;
}

@keyframes chat-upload-indeterminate {
  0% {
    left: -35%;
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
  100% {
    left: 100%;
    opacity: 0.85;
  }
}
</style>
