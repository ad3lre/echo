<script setup lang="ts">
import LimitedGifImg from '@/components/LimitedGifImg.vue';

defineProps<{
  imageUrl: string;
  sessionKey: string;
  forceActive?: boolean;
  /** Vertical crop anchor in percent (0 = top, 50 = center, 100 = bottom). */
  positionY?: number;
}>();
</script>

<template>
  <LimitedGifImg
    :src="imageUrl"
    :session-key="sessionKey"
    :force-active="forceActive ?? false"
    alt=""
    wrapper-class="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    img-class="absolute inset-0 block h-full w-full object-cover object-center"
    :img-style="{
      objectPosition: `50% ${Math.max(0, Math.min(100, Number(positionY ?? 50)))}%`,
    }"
    :respect-reduced-motion="true"
  />
</template>
