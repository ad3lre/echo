<script setup lang="ts">
import LimitedGifImg from '@/components/LimitedGifImg.vue';

defineProps<{
  src: string;
  alt?: string;
}>();
</script>

<template>
  <LimitedGifImg
    :src="src"
    :alt="alt ?? 'GIF'"
    wrapper-class="relative inline-block max-w-full rounded-lg overflow-hidden"
    img-class="block h-auto max-h-[min(80vh,36rem)] w-auto max-w-full rounded-lg object-contain"
    :respect-reduced-motion="true"
  />
</template>
