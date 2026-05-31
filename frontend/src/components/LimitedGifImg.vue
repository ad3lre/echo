<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useLimitedGifPlayback } from '@/composables/useLimitedGifPlayback';
import {
  requiresBundledMediaFallback,
  safeImageUrl,
} from '@/utils/safeImageUrl';
import MediaUnavailablePanel from '@/components/chat/MediaUnavailablePanel.vue';

/** How the GIF is laid out inside the wrapper (see template). */
function layoutModeFromImgClass(
  imgClass: string | undefined,
): 'absolute-stack' | 'fill-cover' | 'intrinsic-contain' {
  const ic = (imgClass ?? '').trim();
  if (ic.includes('absolute') && ic.includes('inset-0')) {
    return 'absolute-stack';
  }
  if (
    /\bh-full\b/.test(ic) &&
    /\bw-full\b/.test(ic) &&
    /\bobject-cover\b/.test(ic)
  ) {
    return 'fill-cover';
  }
  return 'intrinsic-contain';
}

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    /** Changing resets loop budget (e.g. message id, server id). Defaults to `src`. */
    sessionKey?: string;
    imgClass?: string;
    /** Inline styles applied to each <img> element (e.g. `object-position`). */
    imgStyle?: Record<string, string>;
    wrapperClass?: string;
    forceActive?: boolean;
    /** `prefers-reduced-motion: reduce` — static frame only. */
    respectReducedMotion?: boolean;
    /** GIF shows first frame only (no timed loops, no hover replay). */
    staticOnly?: boolean;
    /**
     * `avatar` — small circular slots (pfps): no body text in the unavailable state, scales to wrapper.
     * `panel` — default card with headline/detail (chat embeds, etc.).
     */
    unavailableVariant?: 'panel' | 'avatar';
    /**
     * Bundled image URL when `src` is missing, invalid, or the transparent `safeImageUrl` placeholder.
     * Server/guild surfaces should pass `icons.echoRounded` or use `serverGuildIconDisplayUrl()` upstream.
     */
    missingFallbackSrc?: string;
  }>(),
  {
    alt: '',
    sessionKey: '',
    imgClass: '',
    imgStyle: undefined,
    wrapperClass: '',
    forceActive: false,
    respectReducedMotion: true,
    staticOnly: false,
    unavailableVariant: 'panel',
    missingFallbackSrc: undefined,
  },
);

const reducedMotion = ref(false);
const loadFailed = ref(false);

watch(
  () => [props.src, props.sessionKey] as const,
  () => {
    loadFailed.value = false;
  },
);

function onImgError() {
  loadFailed.value = true;
}

const missingFallbackResolved = computed(
  () => props.missingFallbackSrc?.trim() || icons.usersAvatar,
);

/** Logical URL passed to GIF/static decode — avoids treating “no URL” like a network failure. */
const effectiveImageUrl = computed(() => {
  if (requiresBundledMediaFallback(props.src)) {
    return missingFallbackResolved.value;
  }
  return props.src.trim();
});

onMounted(() => {
  if (!props.respectReducedMotion) return;
  reducedMotion.value = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
});

const fallbackHref = computed(() =>
  requiresBundledMediaFallback(props.src)
    ? undefined
    : safeImageUrl(props.src.trim()),
);

const DEFAULT_MEDIA_UNAVAILABLE_DETAIL =
  'This file could not be loaded. It may be missing, moved, or no longer accessible.';

const mediaUnavailableDetail = computed(() => {
  if (props.unavailableVariant === 'avatar') return '';
  if (
    loadFailed.value &&
    fallbackHref.value &&
    /^https?:\/\//i.test(fallbackHref.value)
  ) {
    return 'If uploads work but images do not load, your bucket may deny anonymous GET — enable public read for this prefix (or use a public R2/custom domain).';
  }
  return DEFAULT_MEDIA_UNAVAILABLE_DETAIL;
});

const session = computed(() =>
  props.sessionKey?.trim() ? props.sessionKey : props.src,
);

const {
  safeUrl,
  isGif,
  staticFrame,
  showAnimated,
  animSrc,
  epoch,
  onPointerEnter,
  onPointerLeave,
} = useLimitedGifPlayback({
  imageUrl: () => effectiveImageUrl.value,
  sessionKey: () => session.value,
  forceActive: () => props.forceActive,
  reducedMotion: () => reducedMotion.value,
  staticOnly: () => props.staticOnly,
});

const mediaUnavailableHeadline = computed(() => {
  if (props.unavailableVariant === 'avatar') {
    return 'Avatar unavailable';
  }
  return isGif.value ? 'GIF unavailable' : 'Image unavailable';
});

function onMouseEnter() {
  if (props.staticOnly) return;
  onPointerEnter();
}
function onMouseLeave() {
  if (props.staticOnly) return;
  onPointerLeave();
}

const layoutMode = computed(() => layoutModeFromImgClass(props.imgClass));

/** Stabilized layouts need `relative` for absolutely layered poster/animated. */
const mergedWrapperClass = computed(() => {
  const base = props.wrapperClass ?? '';
  if (
    layoutMode.value === 'intrinsic-contain' ||
    layoutMode.value === 'fill-cover'
  ) {
    return ['relative', base].filter(Boolean).join(' ');
  }
  return base;
});

/** Layers share one box: sizing comes from full-GIF decode (`safeUrl`), not static PNG. */
const intrinsicPosterOverlayClass =
  'absolute inset-0 z-[1] box-border h-full w-full !max-h-none !max-w-none object-contain';
const intrinsicAnimatedOverlayClass =
  'absolute inset-0 z-[2] box-border h-full w-full !max-h-none !max-w-none object-contain';
const fillOverlayClass = 'absolute inset-0 z-[1]';
const fillAnimatedOverlayClass = 'absolute inset-0 z-[2]';

/** Cross-origin storage (S3/R2) sometimes blocks embedded loads when a Referer is sent; `<img>` does not need creds. */
const imgReferrerPolicy = 'no-referrer';
</script>

<template>
  <div
    :class="mergedWrapperClass"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <MediaUnavailablePanel
      v-if="loadFailed"
      :variant="unavailableVariant === 'avatar' ? 'avatar' : 'default'"
      :headline="mediaUnavailableHeadline"
      :detail="mediaUnavailableDetail"
      :href="fallbackHref"
    />
    <template v-else-if="!isGif">
      <img
        :src="safeUrl"
        :alt="alt"
        :class="props.imgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        @error="onImgError"
      />
    </template>
    <!-- Pre-sized parent + absolute layers: avoids CLS when poster/animated swap or static PNG differs. -->
    <template v-else-if="layoutMode === 'absolute-stack'">
      <!-- Keep the poster visible under the animated layer while the GIF decodes (avoids hover flash). -->
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        :class="props.imgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        @error="onImgError"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        :class="props.imgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        @error="onImgError"
      />
    </template>
    <template v-else-if="layoutMode === 'fill-cover'">
      <img
        aria-hidden="true"
        :src="safeUrl"
        alt=""
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, 'invisible']"
        :style="imgStyle"
        @error="onImgError"
      />
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, fillOverlayClass]"
        :style="imgStyle"
        @error="onImgError"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, fillAnimatedOverlayClass]"
        :style="imgStyle"
        @error="onImgError"
      />
    </template>
    <template v-else>
      <img
        aria-hidden="true"
        :src="safeUrl"
        alt=""
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, 'invisible block']"
        :style="imgStyle"
        @error="onImgError"
      />
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, intrinsicPosterOverlayClass]"
        :style="imgStyle"
        @error="onImgError"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, intrinsicAnimatedOverlayClass]"
        :style="imgStyle"
        @error="onImgError"
      />
    </template>
  </div>
</template>
