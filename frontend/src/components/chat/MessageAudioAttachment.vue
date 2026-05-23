<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import { applyOutputSink } from '@/audio/applyOutputSink';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
}>();

const store = useUiAudioDevicesStore();
const elRef = ref<HTMLAudioElement | null>(null);
const revealed = ref(false);
const loadFailed = ref(false);

const playUrl = computed(() => safeImageUrl(props.url));

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
  },
);

const showUnavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
);

async function syncSink(): Promise<void> {
  const el = elRef.value;
  if (!el) return;
  await applyOutputSink(el);
}

watch(
  () => store.outputSinkId,
  () => {
    void syncSink();
  },
);

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  void syncSink();
  stopObserve = observeChatMediaRetentionVisible(
    rootRef.value,
    props.storageKey,
  );
});

onUnmounted(() => {
  stopObserve?.();
});
</script>

<template>
  <div ref="rootRef" class="message-audio-shell">
    <button
      v-if="props.spoiler && !revealed"
      type="button"
      class="media-spoiler-btn chat-focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-3 bg-overlay-heavy hover:bg-overlay-heavy text-amber-400/90 hover:text-amber-400 text-xs font-semibold uppercase tracking-wider transition-colors"
      @click="revealed = true"
    >
      <span>Spoiler</span>
      <span class="text-[10px] opacity-80">— Click to reveal</span>
    </button>
    <div v-else class="message-audio-inner">
      <MediaUnavailablePanel
        v-if="showUnavailable"
        headline="Audio unavailable"
        :href="isTrustedMediaUrl(url) ? playUrl : undefined"
      />
      <audio
        v-else
        ref="elRef"
        :src="playUrl"
        controls
        preload="metadata"
        class="message-audio"
        @play="queueChatMediaRetentionTouch(storageKey)"
        @error="loadFailed = true"
      />
      <a
        v-if="props.filename"
        :href="safeImageUrl(props.url)"
        class="mt-1 inline-flex max-w-full truncate text-[11px] text-fg-soft hover:text-fg-soft hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        :title="props.filename"
      >
        {{ props.filename }}
      </a>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Fill the message column; avoid width:fit-content here — it makes % widths on
   the inner <audio> cyclic and collapses the control to ~min-intrinsic width. */
.message-audio-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.message-audio-inner {
  width: 100%;
  max-width: min(520px, 100%);
}

.message-audio {
  display: block;
  width: 100%;
  max-width: 100%;
}
</style>
