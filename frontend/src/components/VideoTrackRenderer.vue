<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

type VideoTrackLike = {
  attach: (el: HTMLVideoElement) => void;
  detach: (el: HTMLVideoElement) => void;
};

const props = defineProps<{
  track: VideoTrackLike | null;
  mirror?: boolean;
  objectFit?: 'contain' | 'cover';
}>();

const videoRef = ref<HTMLVideoElement | null>(null);

function attach() {
  const el = videoRef.value;
  const t = props.track;
  if (!el || !t) return;
  t.attach(el);
}

function detach() {
  const el = videoRef.value;
  const t = props.track;
  if (!el || !t) return;
  try {
    t.detach(el);
  } catch {
    // best effort
  }
}

watch(
  () => props.track,
  (_next, prev) => {
    if (prev && videoRef.value) {
      try {
        prev.detach(videoRef.value);
      } catch {
        /* noop */
      }
    }
    attach();
  },
);

onMounted(() => attach());
onUnmounted(() => detach());
</script>

<template>
  <video
    ref="videoRef"
    autoplay
    playsinline
    muted
    :style="{
      objectFit: objectFit ?? 'cover',
      transform: mirror ? 'scaleX(-1)' : undefined,
      width: '100%',
      height: '100%',
    }"
  />
</template>
