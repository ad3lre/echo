<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  computed,
  inject,
  unref,
} from 'vue';
import { useGifSearch, type GifResult } from '@/composables/useGifSearch';
import { useImageSearch } from '@/composables/useImageSearch';
import { pickImageSearchSeed } from '@/utils/imageSearchSeedKeywords';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { LAYOUT_MODALS_KEY } from '@/features/layout/layoutInjectionKeys';

type MediaTab = 'gif' | 'image';

const SHOW_IMAGES_TAB = true;

const props = defineProps<{
  placement?: 'up' | 'down';
  theme?: 'default' | 'forum';
  /** Keywords from recent chat (plus random fallbacks inside picker) to seed image search. */
  seedKeywords?: string[];
}>();

const emit = defineEmits<{
  insertGif: [url: string];
  insertImage: [url: string];
}>();

const activeTab = ref<MediaTab>('gif');
const imageTabSeeded = ref(false);

const {
  query: gifSearchQuery,
  gifs: gifResults,
  loading: gifLoading,
  error: gifError,
  search: searchGifs,
} = useGifSearch();

const {
  query: imageSearchQuery,
  images: imageResults,
  loading: imageLoading,
  loadingMore: imageLoadingMore,
  error: imageError,
  planLimitHit: imagePlanLimitHit,
  hasMore: imageHasMore,
  search: searchImages,
  loadMore: loadMoreImages,
} = useImageSearch();

const authSession = useAuthSessionStore();
const layoutModals = inject(LAYOUT_MODALS_KEY, null);

const imageSearchQuotaLabel = computed(() => {
  const limits = authSession.planLimits;
  if (!limits?.imageSearchesPerDay) return null;
  const used = limits.imageSearchesUsedToday ?? 0;
  const cap = limits.imageSearchesPerDay;
  const remaining = Math.max(0, cap - used);
  return `${remaining} of ${cap} searches left today`;
});

function openEchoPlusSettings() {
  const open = layoutModals?.onOpenSettingsFromProfileBar;
  if (open) unref(open)('Echo+');
}

const imageScrollRoot = ref<HTMLElement | null>(null);
const imageLoadMoreSentinel = ref<HTMLElement | null>(null);
let imageLoadMoreObserver: IntersectionObserver | null = null;

function setupImageLoadMoreObserver() {
  imageLoadMoreObserver?.disconnect();
  imageLoadMoreObserver = null;
  const root = imageScrollRoot.value;
  const target = imageLoadMoreSentinel.value;
  if (!root || !target || activeTab.value !== 'image') return;
  imageLoadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (
        imageHasMore.value &&
        !imageLoading.value &&
        !imageLoadingMore.value
      ) {
        void loadMoreImages();
      }
    },
    { root, rootMargin: '80px', threshold: 0 },
  );
  imageLoadMoreObserver.observe(target);
}

const prefersReducedMotion = computed(
  () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);

const hoveredGifId = ref<string | null>(null);

let gifDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  gifSearchQuery,
  (q) => {
    if (gifDebounceTimer) clearTimeout(gifDebounceTimer);
    const delay = q.trim() ? 250 : 120;
    gifDebounceTimer = setTimeout(() => searchGifs(q), delay);
  },
  { immediate: true },
);

let imageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  imageSearchQuery,
  (q) => {
    if (imageDebounceTimer) clearTimeout(imageDebounceTimer);
    const delay = q.trim() ? 250 : 120;
    imageDebounceTimer = setTimeout(() => searchImages(q), delay);
  },
  { immediate: false },
);

watch(activeTab, (tab) => {
  if (tab !== 'image') {
    imageLoadMoreObserver?.disconnect();
    return;
  }
  if (!imageTabSeeded.value) {
    imageTabSeeded.value = true;
    imageSearchQuery.value = pickImageSearchSeed(props.seedKeywords ?? []);
  }
  queueMicrotask(() => setupImageLoadMoreObserver());
});

watch(
  [imageScrollRoot, imageLoadMoreSentinel, imageHasMore, imageResults],
  () => {
    if (activeTab.value === 'image') setupImageLoadMoreObserver();
  },
);

onMounted(() => {
  gifSearchQuery.value = '';
  imageSearchQuery.value = '';
  imageTabSeeded.value = false;
  activeTab.value = 'gif';
});

onUnmounted(() => {
  imageLoadMoreObserver?.disconnect();
  if (gifDebounceTimer) {
    clearTimeout(gifDebounceTimer);
    gifDebounceTimer = null;
  }
  if (imageDebounceTimer) {
    clearTimeout(imageDebounceTimer);
    imageDebounceTimer = null;
  }
});

function setTab(tab: MediaTab) {
  activeTab.value = tab;
}

function prefetchFullUrl(url: string) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
  setTimeout(() => link.remove(), 5000);
}

function onGifHover(gif: GifResult) {
  hoveredGifId.value = gif.id;
  prefetchFullUrl(gif.url);
}

function onGifLeave() {
  hoveredGifId.value = null;
}

function displayUrl(gif: GifResult): string {
  if (prefersReducedMotion.value) return gif.thumbnailUrl;
  if (hoveredGifId.value === gif.id && gif.previewUrl !== gif.thumbnailUrl) {
    return gif.previewUrl;
  }
  return gif.thumbnailUrl;
}

function tabBtnClass(isActive: boolean) {
  const base =
    'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors';
  if (props.theme === 'forum') {
    return [
      base,
      isActive
        ? 'bg-scrim-2 text-foreground'
        : 'text-fg-subtle hover:bg-scrim-1 hover:text-foreground',
    ];
  }
  return [
    base,
    isActive
      ? 'bg-scrim-2 text-foreground'
      : 'text-muted hover:bg-scrim-1 hover:text-foreground',
  ];
}
</script>

<template>
  <div
    class="chat-popout chat-liquid-glass-menu absolute right-4 w-[min(400px,calc(100%-2rem))] overflow-hidden"
    :class="props.placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'"
    role="menu"
  >
    <div
      class="chat-popout-inner relative z-[1] max-h-[320px] flex flex-col overflow-hidden"
    >
      <div
        v-if="SHOW_IMAGES_TAB"
        class="mx-2 mt-2 flex gap-1 rounded-lg p-0.5"
        :class="props.theme === 'forum' ? 'bg-white/10' : 'bg-scrim-2'"
        role="tablist"
        aria-label="Media type"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'gif'"
          :class="tabBtnClass(activeTab === 'gif')"
          @click="setTab('gif')"
        >
          GIFs
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'image'"
          :class="tabBtnClass(activeTab === 'image')"
          @click="setTab('image')"
        >
          Images
        </button>
      </div>

      <template v-if="!SHOW_IMAGES_TAB || activeTab === 'gif'">
        <input
          v-model="gifSearchQuery"
          type="text"
          placeholder="Search GIFs..."
          class="m-2 rounded-lg border-none bg-scrim-2 px-3 py-2 text-sm outline-none backdrop-blur-sm"
          :class="
            props.theme === 'forum'
              ? 'text-white placeholder:text-fg-subtle'
              : 'text-foreground placeholder:text-muted'
          "
        />
        <div
          class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
          v-scrollbar-on-scroll
        >
          <div v-if="gifError" class="py-8 text-center text-sm text-red-400">
            {{ gifError }}
          </div>
          <div
            v-else-if="gifLoading && gifResults.length === 0"
            class="flex min-h-[10rem] items-center justify-center"
            role="status"
            aria-live="polite"
            aria-label="Loading GIFs"
          >
            <svg
              class="echo-ios-spinner"
              viewBox="0 0 44 44"
              width="34"
              height="34"
              aria-hidden="true"
            >
              <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
              <circle
                class="echo-ios-spinner__arc"
                cx="22"
                cy="22"
                r="18"
                transform="rotate(-90 22 22)"
              />
            </svg>
          </div>
          <div v-else class="grid grid-cols-2 gap-2">
            <button
              v-for="gif in gifResults"
              :key="gif.id"
              type="button"
              role="menuitem"
              class="aspect-video overflow-hidden rounded-lg bg-scrim-1 transition-colors hover:bg-glass-hover"
              :title="gif.title"
              @mouseenter="onGifHover(gif)"
              @mouseleave="onGifLeave"
              @focus="onGifHover(gif)"
              @blur="onGifLeave"
              @click="emit('insertGif', gif.url)"
            >
              <LimitedGifImg
                v-if="
                  !prefersReducedMotion &&
                  hoveredGifId === gif.id &&
                  gif.previewUrl !== gif.thumbnailUrl
                "
                :src="gif.previewUrl"
                :session-key="gif.id"
                :alt="gif.title || 'GIF'"
                wrapper-class="h-full w-full"
                img-class="h-full w-full object-cover"
                :respect-reduced-motion="false"
              />
              <img
                v-else
                :src="displayUrl(gif)"
                :alt="gif.title || 'GIF'"
                class="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="SHOW_IMAGES_TAB && activeTab === 'image'">
        <input
          v-model="imageSearchQuery"
          type="text"
          placeholder="Search images..."
          class="m-2 rounded-lg border-none bg-scrim-2 px-3 py-2 text-sm outline-none backdrop-blur-sm"
          :class="
            props.theme === 'forum'
              ? 'text-white placeholder:text-fg-subtle'
              : 'text-foreground placeholder:text-muted'
          "
        />
        <p
          v-if="imageSearchQuotaLabel"
          class="mx-2 -mt-1 mb-1 text-xs"
          :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'"
        >
          {{ imageSearchQuotaLabel }}
        </p>
        <div
          ref="imageScrollRoot"
          class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
          v-scrollbar-on-scroll
        >
          <div
            v-if="imageError"
            class="py-8 px-3 text-center text-sm text-red-400"
          >
            <p>{{ imageError }}</p>
            <button
              v-if="imagePlanLimitHit"
              type="button"
              class="mt-3 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              @click="openEchoPlusSettings"
            >
              View Echo+ plans
            </button>
          </div>
          <div
            v-else-if="imageLoading && imageResults.length === 0"
            class="flex min-h-[10rem] items-center justify-center"
            role="status"
            aria-live="polite"
            aria-label="Loading images"
          >
            <svg
              class="echo-ios-spinner"
              viewBox="0 0 44 44"
              width="34"
              height="34"
              aria-hidden="true"
            >
              <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
              <circle
                class="echo-ios-spinner__arc"
                cx="22"
                cy="22"
                r="18"
                transform="rotate(-90 22 22)"
              />
            </svg>
          </div>
          <div v-else class="grid grid-cols-2 gap-2">
            <button
              v-for="img in imageResults"
              :key="img.id"
              type="button"
              role="menuitem"
              class="aspect-square overflow-hidden rounded-lg bg-scrim-1 transition-colors hover:bg-glass-hover"
              :title="img.alt"
              @click="emit('insertImage', img.url)"
            >
              <img
                :src="img.thumbUrl"
                :alt="img.alt"
                class="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          </div>
          <div
            v-if="imageResults.length > 0 && imageHasMore"
            ref="imageLoadMoreSentinel"
            class="flex min-h-10 items-center justify-center py-2"
            aria-hidden="true"
          >
            <svg
              v-if="imageLoadingMore"
              class="echo-ios-spinner"
              viewBox="0 0 44 44"
              width="24"
              height="24"
              aria-hidden="true"
            >
              <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
              <circle
                class="echo-ios-spinner__arc"
                cx="22"
                cy="22"
                r="18"
                transform="rotate(-90 22 22)"
              />
            </svg>
          </div>
          <p
            v-if="imageResults.length > 0 && !imageError"
            class="mt-2 px-0.5 text-center text-[10px] leading-snug opacity-70"
            :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'"
          >
            Image results via
            <a
              href="https://serper.dev"
              target="_blank"
              rel="noreferrer noopener"
              class="underline hover:opacity-100"
              @click.stop
              >Serper</a
            >
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-popout {
  z-index: 30;

  /* Glass from .chat-liquid-glass-menu on root; inner is transparent for content */
  .chat-popout-inner {
    position: relative;
    background-color: transparent;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 1.5rem;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--vue-auto-040);
  }
}
</style>
