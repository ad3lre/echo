<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MessageEmbedRemoteImg from './MessageEmbedRemoteImg.vue';

const props = defineProps<{
  slotId: string;
  aspectW: number;
  aspectH: number;
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  canFill?: boolean;
}>();

const emit = defineEmits<{
  fill: [slotId: string];
}>();

const filled = computed(
  () => typeof props.imageUrl === 'string' && props.imageUrl.trim().length > 0,
);

/** Matches composer + chat still-image shells: full column width drives aspect-ratio height. */
const shellStyle = computed(() => ({
  aspectRatio: `${props.aspectW} / ${props.aspectH}`,
  width: '100%',
  maxWidth: 'min(100%, min(92vw, 36rem))',
}));

const imageReady = ref(false);

watch(
  () => props.imageUrl,
  () => {
    imageReady.value = false;
  },
);

const showImageSkeleton = computed(() => filled.value && !imageReady.value);

const imgClass = computed(() =>
  showImageSkeleton.value
    ? 'block h-full w-full object-contain opacity-0 pointer-events-none'
    : 'block h-full w-full object-contain',
);

function onClick() {
  if (!props.canFill || filled.value) return;
  emit('fill', props.slotId);
}

function onImageReady() {
  imageReady.value = true;
}
</script>

<template>
  <div class="message-image-slot my-2 block min-w-0" :style="shellStyle">
    <button
      v-if="!filled"
      type="button"
      class="message-image-slot__empty flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-scrim-1 text-fg-subtle transition-colors"
      :class="
        canFill
          ? 'cursor-pointer hover:border-[#00a8fc] hover:bg-scrim-2 hover:text-fg'
          : 'cursor-default'
      "
      :disabled="!canFill"
      :aria-label="
        canFill
          ? `Add image to ${aspectW}:${aspectH} slot`
          : `Image slot ${aspectW}:${aspectH}`
      "
      @click="onClick"
    >
      <span class="text-xs font-semibold uppercase tracking-wide">
        Image {{ aspectW }}:{{ aspectH }}
      </span>
      <span v-if="canFill" class="mt-1 text-[11px]">Click to add image</span>
    </button>
    <div
      v-else
      class="message-image-slot__filled relative h-full w-full min-h-0 overflow-hidden rounded-lg bg-scrim-1"
    >
      <div
        v-if="showImageSkeleton"
        class="message-image-slot__skeleton"
        aria-hidden="true"
      />
      <MessageEmbedRemoteImg
        :src="imageUrl!"
        alt=""
        :img-class="imgClass"
        @load="onImageReady"
        @error="onImageReady"
      />
    </div>
  </div>
</template>

<style scoped>
.message-image-slot__skeleton {
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
  animation: message-image-slot-shimmer 1.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes message-image-slot-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
