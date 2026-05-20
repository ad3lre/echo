<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { StyleValue } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = defineProps<{
  url: string;
  storageKey?: string;
  alt: string;
  /** When set (e.g. known width/height from attachment metadata), constrains box; omit for intrinsic size */
  imageStyle?: StyleValue;
  /** When true, whole block is a button that emits `open` for lightbox */
  openable?: boolean;
}>();

const emit = defineEmits<{
  open: [];
}>();

const loadFailed = ref(false);

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
  },
);

const resolved = computed(() => safeImageUrl(props.url));
const unavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
);

function styleRecord(
  s: StyleValue | undefined,
): Record<string, string> | undefined {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
  return s as Record<string, string>;
}

/** Known width/height from attachment metadata → fixed aspect box; otherwise intrinsic image size */
const shellStyle = computed((): StyleValue | undefined => {
  const rec = styleRecord(props.imageStyle);
  const ar = rec?.aspectRatio;
  if (typeof ar === 'string' && ar) {
    return {
      aspectRatio: ar,
      width: '100%',
      maxWidth: 'min(100%, 40rem)',
    };
  }
  return undefined;
});

const imgStyle = computed((): StyleValue | undefined => {
  const rec = styleRecord(props.imageStyle);
  if (typeof rec?.aspectRatio === 'string' && rec.aspectRatio) {
    return undefined;
  }
  return props.imageStyle;
});

const imgIsBoxed = computed(() => shellStyle.value != null);

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  void nextTick(() => {
    stopObserve = observeChatMediaRetentionVisible(
      rootRef.value,
      props.storageKey,
    );
  });
});

onUnmounted(() => {
  stopObserve?.();
});

function onImageLoad(): void {
  queueChatMediaRetentionTouch(props.storageKey);
}
</script>

<template>
  <MediaUnavailablePanel
    v-if="unavailable"
    headline="Image unavailable"
    :href="isTrustedMediaUrl(url) ? resolved : undefined"
  />
  <button
    v-else-if="openable"
    ref="rootRef"
    type="button"
    class="block max-w-full min-w-0 text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    @click="emit('open')"
  >
    <div class="message-image-shell" :style="shellStyle">
      <img
        :src="resolved"
        :alt="alt"
        loading="lazy"
        class="message-image"
        :class="{ 'message-image--boxed': imgIsBoxed }"
        :style="imgStyle"
        @load="onImageLoad"
        @error="loadFailed = true"
      />
    </div>
  </button>
  <div v-else ref="rootRef" class="message-image-shell" :style="shellStyle">
    <img
      :src="resolved"
      :alt="alt"
      loading="lazy"
      class="message-image"
      :class="{ 'message-image--boxed': imgIsBoxed }"
      :style="imgStyle"
      @load="onImageLoad"
      @error="loadFailed = true"
    />
  </div>
</template>
