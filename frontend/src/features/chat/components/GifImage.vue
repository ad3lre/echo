<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue';
import type { StyleValue } from 'vue';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { useChatBitmapMediaLayout } from '@/composables/useChatBitmapMediaLayout';
import { observeChatMediaRetentionVisible } from '@/composables/useChatMediaRetentionTouch';

const props = defineProps<{
  src: string;
  storageKey?: string;
  alt?: string;
  /** Known width/height or aspect-ratio style — reserves layout before GIF decodes */
  imageStyle?: StyleValue;
  metadataWidth?: number | null;
  metadataHeight?: number | null;
  /** Chat message attachments: reserve aspect box + skeleton before decode */
  reserveLayout?: boolean;
  loading?: 'lazy' | 'eager';
}>();

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

const useLayout = computed(() => props.reserveLayout === true);

const { shellStyle, showLayoutSkeleton, onMediaDecoded } =
  useChatBitmapMediaLayout({
    url: toRef(props, 'src'),
    imageStyle: toRef(props, 'imageStyle'),
    metadataWidth: toRef(props, 'metadataWidth'),
    metadataHeight: toRef(props, 'metadataHeight'),
  });

const gifLoading = computed(() => props.loading ?? 'eager');

const gifImgClass = computed(() =>
  useLayout.value
    ? 'absolute inset-0 z-[2] box-border h-full w-full !max-h-none !max-w-none object-contain'
    : 'block h-auto max-h-[min(80vh,36rem)] w-auto max-w-full rounded-lg object-contain',
);

onMounted(() => {
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
  <div ref="rootRef" class="inline-block max-w-full">
    <div
      v-if="useLayout"
      class="message-image-shell relative overflow-hidden rounded-lg"
      :style="shellStyle"
    >
      <div
        v-if="showLayoutSkeleton"
        class="message-gif-layout-skeleton"
        aria-hidden="true"
      />
      <LimitedGifImg
        :src="src"
        :alt="alt ?? 'GIF'"
        wrapper-class="relative block h-full w-full min-h-0 overflow-hidden rounded-lg"
        :img-class="gifImgClass"
        :respect-reduced-motion="true"
        :loading="gifLoading"
        @load="onMediaDecoded"
      />
    </div>
    <LimitedGifImg
      v-else
      :src="src"
      :alt="alt ?? 'GIF'"
      wrapper-class="relative inline-block max-w-full rounded-lg overflow-hidden"
      img-class="block h-auto max-h-[min(80vh,36rem)] w-auto max-w-full rounded-lg object-contain"
      :respect-reduced-motion="true"
    />
  </div>
</template>

<style scoped>
.message-gif-layout-skeleton {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: linear-gradient(
    110deg,
    rgb(255 255 255 / 0.04) 8%,
    rgb(255 255 255 / 0.1) 18%,
    rgb(255 255 255 / 0.04) 33%
  );
  background-size: 200% 100%;
  animation: message-gif-layout-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes message-gif-layout-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
