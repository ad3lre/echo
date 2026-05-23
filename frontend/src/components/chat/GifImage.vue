<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { observeChatMediaRetentionVisible } from '@/composables/useChatMediaRetentionTouch';

const props = defineProps<{
  src: string;
  storageKey?: string;
  alt?: string;
}>();

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

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
    <LimitedGifImg
      :src="src"
      :alt="alt ?? 'GIF'"
      wrapper-class="relative inline-block max-w-full rounded-lg overflow-hidden"
      img-class="block h-auto max-h-[min(80vh,36rem)] w-auto max-w-full rounded-lg object-contain"
      :respect-reduced-motion="true"
    />
  </div>
</template>
