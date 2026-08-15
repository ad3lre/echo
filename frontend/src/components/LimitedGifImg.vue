<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useLimitedGifPlayback } from '@/composables/useLimitedGifPlayback';
import { useSignedEchoMediaResponsive } from '@/composables/useSignedEchoMediaResponsive';
import {
  ECHO_AVATAR_RESPONSIVE_WIDTHS,
  ECHO_AVATAR_SIZES,
} from '@/utils/echoMediaResponsive';
import {
  requiresBundledMediaFallback,
  safeImageUrl,
} from '@/utils/safeImageUrl';
import MediaUnavailablePanel from '@/features/chat/components/MediaUnavailablePanel.vue';

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

const emit = defineEmits<{
  load: [];
}>();

const props = withDefaults(
  defineProps<{
    src: string;
    storageKey?: string;
    alt?: string;
    /** Changing resets loop budget (e.g. message id, server id). Defaults to `src`. */
    sessionKey?: string;
    imgClass?: string;
    /** Native `<img loading>` — chat surfaces default to eager for stable layout. */
    loading?: 'lazy' | 'eager';
    /** Inline styles applied to each <img> element (e.g. `object-position`). */
    imgStyle?: Record<string, string>;
    wrapperClass?: string;
    forceActive?: boolean;
    /** `prefers-reduced-motion: reduce` — static frame only. */
    respectReducedMotion?: boolean;
    /** GIF shows first frame only (no timed loops, no hover replay). */
    staticOnly?: boolean;
    /** Treat as GIF even when URL is Echo-hosted (attachment kind gif). */
    forceGif?: boolean;
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
    loading: 'eager',
    wrapperClass: '',
    forceActive: false,
    respectReducedMotion: true,
    staticOnly: false,
    forceGif: false,
    unavailableVariant: 'panel',
    missingFallbackSrc: undefined,
  },
);

const reducedMotion = ref(false);
const loadFailed = ref(false);
const imageLoaded = ref(false);
const responsiveVariantFailed = ref(false);

function onImgError(event: Event) {
  // Responsive variants are an optimization. If a variant is missing or its
  // transform fails, retry the original signed object before showing the
  // unavailable state. This avoids turning one CDN variant failure into a
  // permanently missing avatar.
  if (
    props.unavailableVariant === 'avatar' &&
    !responsiveVariantFailed.value &&
    avatarResponsive.src.value &&
    (event.currentTarget as HTMLImageElement | null)?.currentSrc !==
      safeUrl.value
  ) {
    responsiveVariantFailed.value = true;
    imageLoaded.value = false;
    return;
  }
  loadFailed.value = true;
}

function onImgLoad() {
  imageLoaded.value = true;
  emit('load');
}

const missingFallbackResolved = computed(
  () => props.missingFallbackSrc?.trim() || icons.usersAvatar,
);

/** Logical URL passed to GIF/static decode — avoids treating “no URL” like a network failure. */
const effectiveImageUrl = computed(() => {
  const trimmed = props.src?.trim() ?? '';
  if (!trimmed) return '';
  if (requiresBundledMediaFallback(trimmed)) {
    return missingFallbackResolved.value;
  }
  return trimmed;
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
  preferNativePlayback,
  staticFrame,
  showAnimated,
  animSrc,
  epoch,
  onPointerEnter,
  onPointerLeave,
} = useLimitedGifPlayback({
  imageUrl: () => effectiveImageUrl.value,
  sessionKey: () => session.value,
  storageKey: () => props.storageKey,
  forceActive: () => props.forceActive,
  forceGif: () => props.forceGif,
  reducedMotion: () => reducedMotion.value,
  staticOnly: () => props.staticOnly,
});

const avatarResponsive = useSignedEchoMediaResponsive(
  () =>
    props.unavailableVariant === 'avatar' && !isGif.value
      ? effectiveImageUrl.value
      : '',
  {
    storageKey: () => props.storageKey,
    widths: ECHO_AVATAR_RESPONSIVE_WIDTHS,
    sizes: ECHO_AVATAR_SIZES,
    fallbackWidth: 128,
  },
);

const staticRasterSrc = computed(() =>
  props.unavailableVariant === 'avatar' &&
  avatarResponsive.src.value &&
  !responsiveVariantFailed.value
    ? avatarResponsive.src.value
    : safeUrl.value,
);
const staticRasterSrcset = computed(() =>
  props.unavailableVariant === 'avatar' && !responsiveVariantFailed.value
    ? avatarResponsive.srcset.value
    : '',
);
const staticRasterSizes = computed(() =>
  props.unavailableVariant === 'avatar' &&
  avatarResponsive.srcset.value &&
  !responsiveVariantFailed.value
    ? avatarResponsive.sizes
    : undefined,
);

watch(
  () =>
    [
      props.src,
      props.sessionKey,
      props.storageKey,
      safeUrl.value,
      staticFrame.value,
    ] as const,
  () => {
    loadFailed.value = false;
    imageLoaded.value = false;
    responsiveVariantFailed.value = false;
  },
);

const showAvatarSkeleton = computed(
  () =>
    props.unavailableVariant === 'avatar' &&
    !loadFailed.value &&
    (!safeUrl.value || !imageLoaded.value),
);

const avatarSkeletonRadiusClass = computed(() => {
  const ic = props.imgClass ?? '';
  if (/\brounded-full\b/.test(ic)) return 'rounded-full';
  if (/\brounded-3xl\b/.test(ic)) return 'rounded-3xl';
  if (/\brounded-2xl\b/.test(ic)) return 'rounded-2xl';
  if (/\brounded-xl\b/.test(ic)) return 'rounded-xl';
  if (/\brounded-lg\b/.test(ic)) return 'rounded-lg';
  return 'rounded-full';
});

const resolvedImgClass = computed(() => {
  const base = props.imgClass?.trim() ?? '';
  if (!showAvatarSkeleton.value || !safeUrl.value) return base;
  return [base, 'opacity-0'].filter(Boolean).join(' ');
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
  const needsRelative =
    layoutMode.value === 'intrinsic-contain' ||
    layoutMode.value === 'fill-cover' ||
    showAvatarSkeleton.value;
  if (needsRelative) {
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
    <div
      v-if="showAvatarSkeleton"
      class="avatar-img-skeleton absolute inset-0 z-0"
      :class="avatarSkeletonRadiusClass"
      aria-hidden="true"
    />
    <MediaUnavailablePanel
      v-if="loadFailed"
      :variant="unavailableVariant === 'avatar' ? 'avatar' : 'default'"
      :headline="mediaUnavailableHeadline"
      :detail="mediaUnavailableDetail"
      :href="fallbackHref"
    />
    <template v-else-if="!isGif && safeUrl">
      <img
        :src="staticRasterSrc"
        :srcset="staticRasterSrcset || undefined"
        :sizes="staticRasterSizes"
        :alt="alt"
        :class="resolvedImgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
    </template>
    <!-- CDN GIF fast path: single native animated img (Discord-style). -->
    <template v-else-if="preferNativePlayback && safeUrl">
      <img
        :src="safeUrl"
        :alt="alt"
        :class="resolvedImgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
    </template>
    <!-- Pre-sized parent + absolute layers: avoids CLS when poster/animated swap or static PNG differs. -->
    <template v-else-if="layoutMode === 'absolute-stack' && safeUrl">
      <!-- Keep the poster visible under the animated layer while the GIF decodes (avoids hover flash). -->
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        :class="resolvedImgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        :class="resolvedImgClass"
        :style="imgStyle"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
    </template>
    <template v-else-if="layoutMode === 'fill-cover' && safeUrl">
      <img
        aria-hidden="true"
        :src="safeUrl"
        alt=""
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, 'invisible']"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[resolvedImgClass, fillOverlayClass]"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[resolvedImgClass, fillAnimatedOverlayClass]"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
    </template>
    <template v-else-if="safeUrl">
      <img
        aria-hidden="true"
        :src="safeUrl"
        alt=""
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[props.imgClass, 'invisible block']"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
      <img
        :src="staticFrame ?? safeUrl"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[resolvedImgClass, intrinsicPosterOverlayClass]"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
      <img
        v-if="showAnimated"
        :key="epoch"
        :src="animSrc"
        :alt="alt"
        draggable="false"
        :referrerpolicy="imgReferrerPolicy"
        :class="[resolvedImgClass, intrinsicAnimatedOverlayClass]"
        :style="imgStyle"
        :loading="props.loading"
        decoding="async"
        @error="onImgError"
        @load="onImgLoad"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.avatar-img-skeleton {
  background: color-mix(in srgb, var(--text) 11%, transparent);
  animation: avatar-img-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes avatar-img-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-img-skeleton {
    animation: none;
    opacity: 0.6;
  }
}
</style>
