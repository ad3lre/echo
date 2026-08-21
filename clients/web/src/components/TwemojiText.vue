<script setup lang="ts">
import { computed, nextTick } from 'vue';
import {
  splitTextWithEmoji,
  getTwemojiSrc,
} from '@/features/chat/emoji/twemoji';

const props = withDefaults(
  defineProps<{
    text: string;
    /** CSS class for the root span */
    rootClass?: string;
  }>(),
  { rootClass: '' },
);

const segments = computed(() => splitTextWithEmoji(props.text));

function swapToTwemoji(img: HTMLImageElement) {
  const wrap = img?.parentElement;
  if (!wrap) return;
  const native = wrap.querySelector('.twemoji-native');
  if (native) (native as HTMLElement).style.visibility = 'hidden';
  img.style.visibility = 'visible';
}

function onEmojiImgLoad(e: Event) {
  swapToTwemoji(e.target as HTMLImageElement);
}

function onEmojiImgError() {
  /* img failed to load; native emoji stays visible */
}

function onEmojiImgRef(el: unknown) {
  const img = el instanceof HTMLImageElement ? el : null;
  if (!img) return;
  nextTick(() => {
    if (img.complete && img.naturalWidth > 0) swapToTwemoji(img);
  });
}
</script>

<template>
  <span :class="[rootClass, 'twemoji-text']">
    <template v-for="(seg, i) in segments" :key="i">
      <template v-if="seg.type === 'text'">{{ seg.value }}</template>
      <span v-else class="twemoji-char inline-flex align-middle" role="img">
        <!-- Unicode stays in DOM for copy; hidden once Twemoji loads -->
        <span class="twemoji-native">{{ seg.value }}</span>
        <!-- Twemoji loads async; hidden until loaded for native-first -->
        <img
          v-if="getTwemojiSrc(seg.value)"
          :ref="onEmojiImgRef"
          class="twemoji-img absolute w-[1em] h-[1em] align-baseline"
          :src="getTwemojiSrc(seg.value)!"
          :alt="seg.value"
          loading="eager"
          decoding="async"
          @load="onEmojiImgLoad"
          @error="onEmojiImgError"
        />
      </span>
    </template>
  </span>
</template>

<style scoped>
.twemoji-char {
  position: relative;
  display: inline-flex;
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
}

.twemoji-native {
  /* Visible initially; hidden by JS when Twemoji loads */
}

.twemoji-img {
  left: 0;
  top: 0;
  visibility: hidden; /* Shown on load */
  pointer-events: none;
}
</style>
