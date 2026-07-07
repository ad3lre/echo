<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSignedEchoMediaResponsive } from '@/composables/useSignedEchoMediaResponsive';
import {
  ECHO_CHAT_MEDIA_COLLAGE_SIZES,
  ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS,
} from '@/utils/echoMediaResponsive';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { isTrustedMediaUrl } from '@/utils/safeImageUrl';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';
import type { CollageSourceItem } from '@/features/chat/domain/messageMediaCollage';

const props = defineProps<{
  item: CollageSourceItem;
  /** 'contain' for a lone image, 'cover' for collage cells. */
  fit: 'contain' | 'cover';
  /** > 0 renders a dimmed "+N" overflow badge. */
  overflowCount: number;
}>();

const emit = defineEmits<{ open: [] }>();

const loadFailed = ref(false);
const loaded = ref(false);
const revealed = ref(false);

const {
  src: resolved,
  srcset,
  sizes,
} = useSignedEchoMediaResponsive(() => props.item.url, {
  storageKey: () => props.item.storageKey,
  widths: ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS,
  sizes: ECHO_CHAT_MEDIA_COLLAGE_SIZES,
  fallbackWidth: 640,
});

watch(
  () => [resolved.value, props.item.url] as const,
  () => {
    loadFailed.value = false;
    loaded.value = false;
  },
);

/**
 * Still images gate on a trusted URL + load error here; GIFs render via
 * LimitedGifImg which signs and reports its own unavailable state (and accepts
 * Giphy/Tenor hosts), so we don't pre-gate those.
 */
const unavailable = computed(
  () =>
    !props.item.isGif &&
    (!isTrustedMediaUrl(props.item.url) || loadFailed.value),
);
const spoilered = computed(() => !!props.item.spoiler && !revealed.value);

/** GIF cell fill: cover -> object-cover (fill-cover), contain -> absolute-stack contain. */
const gifImgClass = computed(() =>
  props.fit === 'cover'
    ? 'h-full w-full object-cover'
    : 'absolute inset-0 box-border h-full w-full !max-h-none !max-w-none object-contain',
);

function onLoad(): void {
  loaded.value = true;
  queueChatMediaRetentionTouch(props.item.storageKey);
}

function onClick(): void {
  if (spoilered.value) {
    revealed.value = true;
    return;
  }
  emit('open');
}

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;
onMounted(() => {
  void nextTick(() => {
    stopObserve = observeChatMediaRetentionVisible(
      rootRef.value,
      props.item.storageKey,
    );
  });
});
onUnmounted(() => stopObserve?.());
</script>

<template>
  <button
    ref="rootRef"
    type="button"
    class="collage-cell chat-focus-ring"
    @click="onClick"
  >
    <MediaUnavailablePanel v-if="unavailable" headline="Image unavailable" />
    <template v-else>
      <div v-if="!loaded" class="collage-cell__skeleton" aria-hidden="true" />
      <div
        v-if="item.isGif"
        class="collage-cell__media"
        :class="{
          'collage-cell__media--hidden': !loaded,
          'collage-cell__media--dim': overflowCount > 0,
          'collage-cell__media--spoiler': spoilered,
        }"
      >
        <LimitedGifImg
          :src="item.url"
          :storage-key="item.storageKey"
          :alt="item.alt || 'GIF'"
          wrapper-class="absolute inset-0 h-full w-full"
          :img-class="gifImgClass"
          :respect-reduced-motion="true"
          loading="lazy"
          force-gif
          @load="onLoad"
        />
      </div>
      <img
        v-else
        :src="resolved"
        :srcset="srcset || undefined"
        :sizes="srcset ? sizes : undefined"
        :alt="item.alt || 'Image'"
        loading="lazy"
        class="collage-cell__img"
        :class="[
          `collage-cell__img--${fit}`,
          {
            'collage-cell__img--hidden': !loaded,
            'collage-cell__img--dim': overflowCount > 0,
            'collage-cell__img--spoiler': spoilered,
          },
        ]"
        @load="onLoad"
        @error="loadFailed = true"
      />
      <span v-if="overflowCount > 0" class="collage-cell__more">
        +{{ overflowCount }}
      </span>
      <span v-else-if="spoilered" class="collage-cell__spoiler">SPOILER</span>
    </template>
  </button>
</template>

<style scoped lang="scss">
@use '@/assets/echoSkeletonShimmer' as skel;

.collage-cell {
  position: relative;
  display: block;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: color-mix(in srgb, var(--bg) 70%, black);
}

.collage-cell__skeleton {
  position: absolute;
  inset: 0;
  @include skel.fill;
  @include skel.reduced-motion;
}

.collage-cell__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.collage-cell__img--cover {
  object-fit: cover;
}
.collage-cell__img--contain {
  object-fit: contain;
}
.collage-cell__img--hidden {
  opacity: 0;
}
.collage-cell__img--dim {
  filter: brightness(0.4);
}
.collage-cell__img--spoiler {
  filter: blur(28px);
  transform: scale(1.08);
}

/* GIF cells fill the same box via LimitedGifImg; dim/spoiler/hidden apply to the wrapper. */
.collage-cell__media {
  position: absolute;
  inset: 0;
}
.collage-cell__media--hidden {
  opacity: 0;
}
.collage-cell__media--dim {
  filter: brightness(0.4);
}
.collage-cell__media--spoiler {
  filter: blur(28px);
  transform: scale(1.08);
}

.collage-cell__more {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  pointer-events: none;
}

.collage-cell__spoiler {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}
</style>
