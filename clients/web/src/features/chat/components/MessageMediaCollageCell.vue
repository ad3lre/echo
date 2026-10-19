<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSignedEchoMediaResponsive } from '@/features/chat/composables/useSignedEchoMediaResponsive';
import {
  ECHO_CHAT_MEDIA_COLLAGE_SIZES,
  ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS,
} from '@/features/chat/composables/echoMediaResponsive';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/features/chat/composables/useChatMediaRetentionTouch';
import { isTrustedMediaUrl } from '@/features/layout/display/safeImageUrl';
import { echoUploadMediaCrossOrigin } from '@/features/chat/echoUploadMediaCredentials';
import { sampleLetterboxMatteFromImage } from '@/features/chat/composables/sampleLetterboxMatteFromImage';
import type { LetterboxMatte } from '@/features/chat/domain/imageLetterboxMatte';
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
/** Letterbox fill: blur wash from the image, or exact solid when flat. */
const letterboxMatte = ref<LetterboxMatte>({ kind: 'blur' });
const imgRef = ref<HTMLImageElement | null>(null);

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

const imgCrossOrigin = computed(() =>
  echoUploadMediaCrossOrigin(resolved.value ?? props.item.url),
);

watch(
  () => [resolved.value, props.item.url] as const,
  () => {
    loadFailed.value = false;
    loaded.value = false;
    letterboxMatte.value = { kind: 'blur' };
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
const showLetterboxMatte = computed(
  () => props.fit === 'contain' && loaded.value && !spoilered.value,
);

/** GIF cell fill: cover -> object-cover (fill-cover), contain -> absolute-stack contain. */
const gifImgClass = computed(() =>
  props.fit === 'cover'
    ? 'h-full w-full object-cover'
    : 'absolute inset-0 box-border h-full w-full !max-h-none !max-w-none object-contain',
);

const gifMatteClass =
  'absolute inset-0 box-border h-full w-full !max-h-none !max-w-none object-cover';

function refreshLetterboxMatte(img: HTMLImageElement | null): void {
  if (props.fit !== 'contain' || !img?.naturalWidth) {
    letterboxMatte.value = { kind: 'blur' };
    return;
  }
  letterboxMatte.value = sampleLetterboxMatteFromImage(img);
}

function onLoad(event?: Event): void {
  loaded.value = true;
  queueChatMediaRetentionTouch(props.item.storageKey);
  const target = event?.target;
  if (target instanceof HTMLImageElement) {
    refreshLetterboxMatte(target);
  } else {
    refreshLetterboxMatte(imgRef.value);
  }
}

/** Empty `src` while CDN signing finishes must not flip to "unavailable". */
function onStillError(): void {
  if (!resolved.value?.trim()) return;
  loadFailed.value = true;
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
    :class="{ 'collage-cell--letterbox': fit === 'contain' }"
    :style="
      showLetterboxMatte && letterboxMatte.kind === 'solid'
        ? { background: letterboxMatte.css }
        : undefined
    "
    @click="onClick"
  >
    <MediaUnavailablePanel
      v-if="unavailable"
      :headline="echoT('chat.status.imageUnavailable')"
    />
    <template v-else>
      <div v-if="!loaded" class="collage-cell__skeleton" aria-hidden="true" />
      <!-- Soft image-derived wash behind letterboxed (contain) media. -->
      <template v-if="fit === 'contain' && letterboxMatte.kind === 'blur'">
        <div
          v-if="item.isGif && loaded"
          class="collage-cell__matte"
          aria-hidden="true"
        >
          <LimitedGifImg
            :src="item.url"
            :storage-key="item.storageKey"
            alt=""
            wrapper-class="absolute inset-0 h-full w-full"
            :img-class="gifMatteClass"
            :respect-reduced-motion="true"
            loading="eager"
            force-gif
          />
        </div>
        <img
          v-else-if="!item.isGif && loaded && resolved"
          :src="resolved"
          :srcset="srcset || undefined"
          :sizes="srcset ? sizes : undefined"
          alt=""
          aria-hidden="true"
          class="collage-cell__matte-img"
          :crossorigin="imgCrossOrigin ?? undefined"
        />
      </template>
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
          loading="eager"
          force-gif
          @load="onLoad"
        />
      </div>
      <img
        v-else-if="resolved"
        ref="imgRef"
        :src="resolved"
        :srcset="srcset || undefined"
        :sizes="srcset ? sizes : undefined"
        :alt="item.alt || 'Image'"
        loading="eager"
        decoding="async"
        class="collage-cell__img"
        :class="[
          `collage-cell__img--${fit}`,
          {
            'collage-cell__img--hidden': !loaded,
            'collage-cell__img--dim': overflowCount > 0,
            'collage-cell__img--spoiler': spoilered,
          },
        ]"
        :crossorigin="imgCrossOrigin ?? undefined"
        @load="onLoad"
        @error="onStillError"
      />
      <span v-if="overflowCount > 0" class="collage-cell__more">
        +{{ overflowCount }}
      </span>
      <span v-else-if="spoilered" class="collage-cell__spoiler">SPOILER</span>
    </template>
  </button>
</template>

<style scoped lang="scss" src="./styles/MessageMediaCollageCell.scss"></style>
