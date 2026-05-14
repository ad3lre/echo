<script setup lang="ts">
import { computed } from 'vue';
import LimitedGifImg from '@/components/LimitedGifImg.vue';

const DEFAULT_WRAPPER_CLASS =
  'relative block h-full min-h-0 w-full min-w-0 overflow-hidden';

const props = withDefaults(
  defineProps<{
    src: string;
    alt: string;
    imgClass?: string;
    /**
     * Override the outer wrapper. Default fills a sized parent (e.g. avatar slots).
     * For inline role icons in a flex row, pass explicit size + shrink-0 (e.g.
     * `relative h-4 w-4 shrink-0 overflow-hidden`) — avoid `w-full` there or the
     * item expands across the row.
     */
    wrapperClass?: string;
    forceActive?: boolean;
    /** Defaults true — avatars should not loop forever (first frame after decode). */
    staticOnly?: boolean;
    /** Optional key when `src` alone should not reset session (e.g. user id). */
    sessionKey?: string;
    /** Bundled default when `src` is empty / invalid / safeImageUrl placeholder (e.g. `icons.echoRounded` for guild icons). */
    missingFallbackSrc?: string;
  }>(),
  {
    imgClass: '',
    wrapperClass: '',
    forceActive: false,
    staticOnly: true,
    sessionKey: '',
    missingFallbackSrc: undefined,
  },
);

const resolvedWrapperClass = computed(() => {
  const w = props.wrapperClass?.trim();
  return w || DEFAULT_WRAPPER_CLASS;
});

const mergedImgClass = computed(() =>
  ['absolute inset-0 h-full w-full object-cover', props.imgClass?.trim() || '']
    .filter(Boolean)
    .join(' '),
);

const session = computed(() =>
  props.sessionKey?.trim() ? props.sessionKey : props.src,
);
</script>

<template>
  <LimitedGifImg
    :src="src"
    :alt="alt"
    :force-active="forceActive"
    :session-key="session"
    :static-only="staticOnly"
    :missing-fallback-src="missingFallbackSrc"
    unavailable-variant="avatar"
    :wrapper-class="resolvedWrapperClass"
    :img-class="mergedImgClass"
    :respect-reduced-motion="true"
  />
</template>
