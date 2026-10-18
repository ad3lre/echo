<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useLimitedGifPlayback } from '@/features/chat/useLimitedGifPlayback';
import { useSignedEchoMediaResponsive } from '@/features/chat/composables/useSignedEchoMediaResponsive';
import { echoMediaUrlNeedsSigning } from '@/features/chat/mediaCdn';
import {
  ECHO_AVATAR_RESPONSIVE_WIDTHS,
  ECHO_AVATAR_SIZES,
} from '@/features/chat/composables/echoMediaResponsive';
import {
  requiresBundledMediaFallback,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';
import {
  avatarInitialsFromName,
  avatarMonogramHue,
} from '@/features/layout/display/avatarMonogram';
import MediaUnavailablePanel from '@/features/chat/components/MediaUnavailablePanel.vue';

/** Hung CDN / sign requests must not leave avatars pulsing forever. */
const AVATAR_LOAD_TIMEOUT_MS = 8_000;

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
const signedUrlRefreshAttempted = ref(false);
let avatarLoadTimeout: ReturnType<typeof setTimeout> | null = null;

function clearAvatarLoadTimeout() {
  if (avatarLoadTimeout != null) {
    clearTimeout(avatarLoadTimeout);
    avatarLoadTimeout = null;
  }
}

function armAvatarLoadTimeout() {
  clearAvatarLoadTimeout();
  if (props.unavailableVariant !== 'avatar') return;
  if (loadFailed.value || imageLoaded.value) return;
  avatarLoadTimeout = setTimeout(() => {
    avatarLoadTimeout = null;
    if (!imageLoaded.value) {
      loadFailed.value = true;
    }
  }, AVATAR_LOAD_TIMEOUT_MS);
}

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
  // A cached signed URL can expire between render and the browser request.
  // Re-sign once before showing the unavailable avatar state.
  if (
    props.unavailableVariant === 'avatar' &&
    !signedUrlRefreshAttempted.value &&
    echoMediaUrlNeedsSigning(safeImageUrl(props.src))
  ) {
    signedUrlRefreshAttempted.value = true;
    loadFailed.value = false;
    imageLoaded.value = false;
    responsiveVariantFailed.value = false;
    void avatarResponsive.refresh(true);
    return;
  }
  loadFailed.value = true;
  clearAvatarLoadTimeout();
}

function onImgLoad() {
  imageLoaded.value = true;
  clearAvatarLoadTimeout();
  emit('load');
}

const missingFallbackResolved = computed(
  () => props.missingFallbackSrc?.trim() || icons.usersAvatar,
);

const preferAvatarMonogramOverBundledIcon = computed(
  () =>
    props.unavailableVariant === 'avatar' && !props.missingFallbackSrc?.trim(),
);

/** Logical URL passed to GIF/static decode — avoids treating “no URL” like a network failure. */
const effectiveImageUrl = computed(() => {
  const trimmed = props.src?.trim() ?? '';
  if (!trimmed) {
    // Avatars: initials monogram instead of a generic people icon / skeleton.
    if (preferAvatarMonogramOverBundledIcon.value) return '';
    return missingFallbackResolved.value;
  }
  if (requiresBundledMediaFallback(trimmed)) {
    if (preferAvatarMonogramOverBundledIcon.value) return '';
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

onUnmounted(() => {
  clearAvatarLoadTimeout();
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
    signedUrlRefreshAttempted.value = false;
    armAvatarLoadTimeout();
  },
);

watch(
  () =>
    [
      props.unavailableVariant,
      safeUrl.value,
      imageLoaded.value,
      loadFailed.value,
    ] as const,
  () => {
    if (
      props.unavailableVariant === 'avatar' &&
      safeUrl.value &&
      !imageLoaded.value &&
      !loadFailed.value
    ) {
      armAvatarLoadTimeout();
    } else if (imageLoaded.value || loadFailed.value || !safeUrl.value) {
      clearAvatarLoadTimeout();
    }
  },
  { immediate: true },
);

/** Initials under the image while loading / when pfp is missing or failed. */
const showAvatarMonogram = computed(
  () =>
    props.unavailableVariant === 'avatar' &&
    (loadFailed.value || !safeUrl.value || !imageLoaded.value),
);

const avatarMonogramInitials = computed(() =>
  avatarInitialsFromName(props.alt),
);

const avatarMonogramHueValue = computed(() =>
  avatarMonogramHue(props.sessionKey?.trim() || props.alt),
);

const avatarSlotRadiusClass = computed(() => {
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
  if (!showAvatarMonogram.value || !safeUrl.value) return base;
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
    showAvatarMonogram.value;
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
      v-if="showAvatarMonogram"
      class="avatar-monogram absolute inset-0 z-0 flex items-center justify-center"
      :class="avatarSlotRadiusClass"
      :style="{ '--avatar-monogram-hue': String(avatarMonogramHueValue) }"
      aria-hidden="true"
    >
      <span class="avatar-monogram__text">{{ avatarMonogramInitials }}</span>
    </div>
    <MediaUnavailablePanel
      v-if="loadFailed && unavailableVariant !== 'avatar'"
      variant="default"
      :headline="mediaUnavailableHeadline"
      :detail="mediaUnavailableDetail"
      :href="fallbackHref"
    />
    <template v-if="!loadFailed && !isGif && safeUrl">
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
    <template v-else-if="!loadFailed && preferNativePlayback && safeUrl">
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
    <template
      v-else-if="!loadFailed && layoutMode === 'absolute-stack' && safeUrl"
    >
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
    <template v-else-if="!loadFailed && layoutMode === 'fill-cover' && safeUrl">
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
    <template v-else-if="!loadFailed && safeUrl">
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
.avatar-monogram {
  container-type: size;
  overflow: hidden;
  user-select: none;
}

.avatar-monogram__text {
  font-size: max(0.5rem, 37.5cqmin);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  text-transform: uppercase;
}
</style>
