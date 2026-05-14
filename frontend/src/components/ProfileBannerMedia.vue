<script setup lang="ts">
import { computed } from 'vue';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';

const props = withDefaults(
  defineProps<{
    bannerImage: string;
    /** Session key for GIF loop budget (e.g. `${userId}-banner`). */
    sessionKey: string;
    /** Applied to LimitedGifImg wrapper or the static background div. */
    wrapperClass?: string;
    /** Vertical crop anchor in percent (0 = top, 50 = center, 100 = bottom). */
    positionY?: number;
  }>(),
  { wrapperClass: 'absolute inset-0 z-0 overflow-hidden', positionY: 50 },
);

const safe = computed(() => safeImageUrl(props.bannerImage));
const useLimitedPlayback = computed(() => isLikelyGifImageUrl(safe.value));
const objectPosition = computed(() => {
  const y = Number(props.positionY);
  const clamped = Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50;
  return `50% ${clamped}%`;
});
</script>

<template>
  <LimitedGifImg
    v-if="useLimitedPlayback"
    :src="safe"
    :session-key="sessionKey"
    alt=""
    :wrapper-class="wrapperClass"
    img-class="absolute inset-0 block h-full w-full object-cover"
    :img-style="{ objectPosition }"
    :respect-reduced-motion="true"
  />
  <div
    v-else
    :class="wrapperClass"
    :style="{
      backgroundImage: `url(${safe})`,
      backgroundSize: 'cover',
      backgroundPosition: objectPosition,
    }"
  />
</template>
