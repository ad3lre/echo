<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    imgClass?: string;
    compact?: boolean;
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
    richLinkPlayOverlay: false,
    richLinkOverlayFill: true,
  },
);

const loadFailed = ref(false);

watch(
  () => props.src,
  () => {
    loadFailed.value = false;
  },
);

const resolved = computed(() => safeImageUrl(props.src));
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
      :alt="alt"
      :class="imgClass"
      loading="lazy"
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
    :alt="alt"
    :class="imgClass"
    loading="lazy"
    @load="onLoad"
    @error="onError"
  />
</template>
