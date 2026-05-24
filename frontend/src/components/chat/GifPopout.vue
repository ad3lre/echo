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
import {
  useMediaFavorites,
  gifToMediaFavorite,
  imageToMediaFavorite,
  type MediaFavorite,
} from '@/composables/useMediaFavorites';
import { pickImageSearchSeed } from '@/utils/imageSearchSeedKeywords';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { LAYOUT_MODALS_KEY } from '@/features/layout/layoutInjectionKeys';
import { icons } from '@/assets/icons';

type MediaTab = 'gif' | 'image' | 'favorites';

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
/** GIF vs image context for the favorites folder (Discord-style per-picker collection). */
const browseKind = ref<'gif' | 'image'>('gif');
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

const { gifFavorites, imageFavorites, isFavorite, toggleFavorite } =
  useMediaFavorites();

const favoritesForBrowseKind = computed(() =>
  browseKind.value === 'gif' ? gifFavorites.value : imageFavorites.value,
);

const favoritesEmptyLabel = computed(() =>
  browseKind.value === 'gif'
    ? 'Star GIFs while browsing to save them here.'
    : 'Star images while browsing to save them here.',
);

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
  browseKind.value = 'gif';
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
  if (tab === 'gif' || tab === 'image') browseKind.value = tab;
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

function isGifFavorited(gif: GifResult): boolean {
  return isFavorite(gifToMediaFavorite(gif).id);
}

function isImageFavorited(img: {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
}): boolean {
  return isFavorite(imageToMediaFavorite(img).id);
}

function toggleGifFavorite(gif: GifResult, event: Event) {
  event.stopPropagation();
  event.preventDefault();
  toggleFavorite(gifToMediaFavorite(gif));
}

function toggleImageFavorite(
  img: { id: string; url: string; thumbUrl: string; alt: string },
  event: Event,
) {
  event.stopPropagation();
  event.preventDefault();
  toggleFavorite(imageToMediaFavorite(img));
}

function toggleSavedFavorite(fav: MediaFavorite, event: Event) {
  event.stopPropagation();
  event.preventDefault();
  toggleFavorite(fav);
}

function insertFavorite(fav: MediaFavorite) {
  if (fav.kind === 'gif') emit('insertGif', fav.url);
  else emit('insertImage', fav.url);
}

function onFavoriteGifHover(fav: MediaFavorite) {
  if (fav.kind !== 'gif') return;
  hoveredGifId.value = fav.id;
  if (fav.previewUrl) prefetchFullUrl(fav.previewUrl);
}

function favoriteGifDisplayUrl(fav: MediaFavorite): string {
  if (fav.kind !== 'gif') return fav.thumbUrl;
  if (prefersReducedMotion.value) return fav.thumbUrl;
  if (
    hoveredGifId.value === fav.id &&
    fav.previewUrl &&
    fav.previewUrl !== fav.thumbUrl
  ) {
    return fav.previewUrl;
  }
  return fav.thumbUrl;
}

function displayUrl(gif: GifResult): string {
  if (prefersReducedMotion.value) return gif.thumbnailUrl;
  if (hoveredGifId.value === gif.id && gif.previewUrl !== gif.thumbnailUrl) {
    return gif.previewUrl;
  }
  return gif.thumbnailUrl;
}

function tabBtnClass(isActive: boolean, iconOnly = false) {
  const base = iconOnly
    ? 'flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors'
    : 'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors';
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
      class="chat-popout-inner relative z-[1] max-h-[26rem] flex flex-col overflow-hidden"
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
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'favorites'"
          :class="tabBtnClass(activeTab === 'favorites', true)"
          aria-label="Favorites"
          :title="browseKind === 'gif' ? 'Favorite GIFs' : 'Favorite images'"
          @click="setTab('favorites')"
        >
          <img
            :src="icons.folder"
            alt=""
            class="h-4 w-4 opacity-90"
            :class="activeTab === 'favorites' ? 'opacity-100' : ''"
            aria-hidden="true"
          />
        </button>
      </div>

      <template v-if="activeTab === 'favorites'">
        <div
          class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
          v-scrollbar-on-scroll
        >
          <div
            v-if="favoritesForBrowseKind.length === 0"
            class="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 py-8 text-center"
          >
            <img
              :src="icons.folder"
              alt=""
              class="h-10 w-10 opacity-40"
              aria-hidden="true"
            />
            <p
              class="text-sm font-medium"
              :class="
                props.theme === 'forum' ? 'text-foreground' : 'text-foreground'
              "
            >
              No favorites yet
            </p>
            <p
              class="text-xs leading-snug"
              :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'"
            >
              {{ favoritesEmptyLabel }}
            </p>
          </div>
          <div v-else class="grid grid-cols-2 gap-2">
            <div
              v-for="fav in favoritesForBrowseKind"
              :key="fav.id"
              class="group relative aspect-video overflow-hidden rounded-lg bg-scrim-1"
              :class="fav.kind === 'image' ? 'aspect-square' : ''"
            >
              <button
                type="button"
                role="menuitem"
                class="h-full w-full transition-colors hover:bg-glass-hover"
                :title="fav.title"
                @mouseenter="onFavoriteGifHover(fav)"
                @mouseleave="onGifLeave"
                @focus="onFavoriteGifHover(fav)"
                @blur="onGifLeave"
                @click="insertFavorite(fav)"
              >
                <template v-if="fav.kind === 'gif'">
                  <LimitedGifImg
                    v-if="
                      !prefersReducedMotion &&
                      hoveredGifId === fav.id &&
                      fav.previewUrl &&
                      fav.previewUrl !== fav.thumbUrl
                    "
                    :src="fav.previewUrl"
                    :session-key="fav.id"
                    :alt="fav.title"
                    wrapper-class="h-full w-full"
                    img-class="h-full w-full object-cover"
                    :respect-reduced-motion="false"
                  />
                  <img
                    v-else
                    :src="favoriteGifDisplayUrl(fav)"
                    :alt="fav.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                </template>
                <img
                  v-else
                  :src="fav.thumbUrl"
                  :alt="fav.title"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
              <button
                type="button"
                class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-overlay-heavy text-amber-300 opacity-100 shadow-sm transition-opacity hover:bg-overlay-heavy sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                aria-label="Remove from favorites"
                @click="toggleSavedFavorite(fav, $event)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2l2.39 6.26L21 9.27l-5 4.87 1.18 6.88L12 17.77l-5.18 3.25L8 14.14 3 9.27l6.61-1.01L12 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="!SHOW_IMAGES_TAB || activeTab === 'gif'">
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
            <div
              v-for="gif in gifResults"
              :key="gif.id"
              class="group relative aspect-video overflow-hidden rounded-lg bg-scrim-1"
            >
              <button
                type="button"
                role="menuitem"
                class="h-full w-full transition-colors hover:bg-glass-hover"
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
              <button
                type="button"
                class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-overlay-heavy shadow-sm transition-opacity hover:bg-overlay-heavy"
                :class="
                  isGifFavorited(gif)
                    ? 'text-amber-300 opacity-100'
                    : 'text-foreground/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
                "
                :aria-label="
                  isGifFavorited(gif)
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                "
                @click="toggleGifFavorite(gif, $event)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  :fill="isGifFavorited(gif) ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="1.75"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2l2.39 6.26L21 9.27l-5 4.87 1.18 6.88L12 17.77l-5.18 3.25L8 14.14 3 9.27l6.61-1.01L12 2z"
                  />
                </svg>
              </button>
            </div>
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
            <div
              v-for="img in imageResults"
              :key="img.id"
              class="group relative aspect-square overflow-hidden rounded-lg bg-scrim-1"
            >
              <button
                type="button"
                role="menuitem"
                class="h-full w-full transition-colors hover:bg-glass-hover"
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
              <button
                type="button"
                class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md bg-overlay-heavy shadow-sm transition-opacity hover:bg-overlay-heavy"
                :class="
                  isImageFavorited(img)
                    ? 'text-amber-300 opacity-100'
                    : 'text-foreground/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
                "
                :aria-label="
                  isImageFavorited(img)
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                "
                @click="toggleImageFavorite(img, $event)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  :fill="isImageFavorited(img) ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="1.75"
                  aria-hidden="true"
                >
                  <path
                    d="M12 2l2.39 6.26L21 9.27l-5 4.87 1.18 6.88L12 17.77l-5.18 3.25L8 14.14 3 9.27l6.61-1.01L12 2z"
                  />
                </svg>
              </button>
            </div>
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
