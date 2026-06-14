<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
} from 'vue';
import type { StyleValue } from 'vue';
import { useChatBitmapMediaLayout } from '@/composables/useChatBitmapMediaLayout';
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
  /** When set (e.g. known width/height from attachment metadata), constrains box; omit to probe URL */
  imageStyle?: StyleValue;
  metadataWidth?: number | null;
  metadataHeight?: number | null;
  /** When true, whole block is a button that emits `open` for lightbox */
  openable?: boolean;
  loading?: 'lazy' | 'eager';
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

const { shellStyle, showLayoutSkeleton, onMediaDecoded } =
  useChatBitmapMediaLayout({
    url: toRef(props, 'url'),
    imageStyle: toRef(props, 'imageStyle'),
    metadataWidth: toRef(props, 'metadataWidth'),
    metadataHeight: toRef(props, 'metadataHeight'),
  });

const imgLoading = computed(() => props.loading ?? 'eager');

function onImageLoad(): void {
  onMediaDecoded();
  queueChatMediaRetentionTouch(props.storageKey);
}

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
      <div
        v-if="showLayoutSkeleton"
        class="message-image-layout-skeleton"
        aria-hidden="true"
      />
      <img
        :src="resolved"
        :alt="alt"
        :loading="imgLoading"
        class="message-image message-image--boxed"
        :class="{ 'message-image--hidden': showLayoutSkeleton }"
        @load="onImageLoad"
        @error="loadFailed = true"
      />
    </div>
  </button>
  <div v-else ref="rootRef" class="message-image-shell" :style="shellStyle">
    <div
      v-if="showLayoutSkeleton"
      class="message-image-layout-skeleton"
      aria-hidden="true"
    />
    <img
      :src="resolved"
      :alt="alt"
      :loading="imgLoading"
      class="message-image message-image--boxed"
      :class="{ 'message-image--hidden': showLayoutSkeleton }"
      @load="onImageLoad"
      @error="loadFailed = true"
    />
  </div>
</template>

<style scoped>
.message-image-shell {
  position: relative;
}

.message-image-layout-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    110deg,
    rgb(255 255 255 / 0.04) 8%,
    rgb(255 255 255 / 0.1) 18%,
    rgb(255 255 255 / 0.04) 33%
  );
  background-size: 200% 100%;
  animation: message-image-layout-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
}

.message-image--hidden {
  opacity: 0;
  pointer-events: none;
}

@keyframes message-image-layout-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
