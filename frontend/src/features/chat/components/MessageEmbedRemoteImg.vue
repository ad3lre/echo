<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isTrustedMediaUrl } from '@/utils/safeImageUrl';
import { useSignedEchoMediaResponsive } from '@/composables/useSignedEchoMediaResponsive';
import {
  ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS,
  ECHO_CHAT_MEDIA_SINGLE_SIZES,
} from '@/utils/echoMediaResponsive';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = withDefaults(
  defineProps<{
    src: string;
    storageKey?: string;
    alt?: string;
    imgClass?: string;
    compact?: boolean;
    /** Native `<img loading>` — chat embeds default to eager for stable layout. */
    loading?: 'lazy' | 'eager';
    /** Rich embed: large image inside a link with a decorative “play” affordance (only when the image loads). */
    richLinkPlayOverlay?: boolean;
    /**
     * When the parent sets a fixed aspect ratio, the overlay wrapper should fill it (`h-full`).
     * For intrinsic-height images, use false so the wrapper sizes to the image.
     */
    richLinkOverlayFill?: boolean;
  }>(),
  {
    alt: '',
    imgClass: '',
    compact: false,
    loading: 'eager',
    richLinkPlayOverlay: false,
    richLinkOverlayFill: true,
  },
);

const loadFailed = ref(false);

watch(
  () => [props.src, props.storageKey] as const,
  () => {
    loadFailed.value = false;
  },
);

const imgLoading = computed(() => props.loading ?? 'eager');
const {
  src: resolved,
  srcset,
  sizes,
} = useSignedEchoMediaResponsive(() => props.src, {
  storageKey: () => props.storageKey,
  widths: ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS,
  sizes: ECHO_CHAT_MEDIA_SINGLE_SIZES,
  fallbackWidth: 640,
});
watch(resolved, () => {
  loadFailed.value = false;
});
const unavailable = computed(
  () => !isTrustedMediaUrl(props.src) || loadFailed.value,
);

const emit = defineEmits<{
  load: [];
  error: [];
}>();

function onLoad() {
  emit('load');
}

function onError() {
  loadFailed.value = true;
  emit('error');
}
</script>

<template>
  <MediaUnavailablePanel
    v-if="unavailable"
    headline="Preview unavailable"
    detail="We could not load this preview image."
    :compact="compact"
    :href="isTrustedMediaUrl(src) ? resolved : undefined"
  />
  <div
    v-else-if="richLinkPlayOverlay"
    :class="
      richLinkOverlayFill
        ? 'relative block h-full w-full min-h-0'
        : 'relative block w-full min-h-0'
    "
  >
    <img
      :src="resolved"
      :srcset="srcset || undefined"
      :sizes="srcset ? sizes : undefined"
      :alt="alt"
      :class="imgClass"
      :loading="imgLoading"
      @load="onLoad"
      @error="onError"
    />
    <div
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-scrim-1 transition-colors group-hover:bg-scrim-2"
      aria-hidden="true"
    >
      <span
        class="flex h-14 w-14 items-center justify-center rounded-full bg-scrim-2 text-white shadow-lg ring-2 ring-white/25 backdrop-blur-sm"
      >
        <svg
          class="ml-0.5 h-7 w-7"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </div>
  </div>
  <img
    v-else
    :src="resolved"
    :srcset="srcset || undefined"
    :sizes="srcset ? sizes : undefined"
    :alt="alt"
    :class="imgClass"
    :loading="imgLoading"
    @load="onLoad"
    @error="onError"
  />
</template>
