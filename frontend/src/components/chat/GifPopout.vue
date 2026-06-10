<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  computed,
  inject,
  unref,
  nextTick,
} from 'vue';
import {
  useGifSearch,
  type GifResult,
  warmGifCategoryLibrary,
  getGifCategoryPreviewUrls,
  getCachedGifCategoryResults,
  gifCategoryLibraryRevision,
} from '@/composables/useGifSearch';
import {
  useImageSearch,
  warmImageCategoryLibrary,
  getImageCategoryPreviewUrls,
  getCachedImageCategoryResults,
  imageCategoryLibraryRevision,
} from '@/composables/useImageSearch';
import {
  GIF_BROWSE_CATEGORIES,
  type MediaBrowseCategory,
} from '@/data/mediaCategoryLibrary';
import { useImageBrowseCategories } from '@/composables/useImageBrowseCategories';
import {
  useMediaFavorites,
  gifToMediaFavorite,
  imageToMediaFavorite,
  type MediaFavorite,
} from '@/composables/useMediaFavorites';
import { mediaFavoriteStarBtnClass } from '@/utils/mediaFavoriteStarBtnClass';
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
  /** GIF toolbar button — used to position the teleported popout above overflow clips. */
  anchorEl?: HTMLElement | null;
}>();

const emit = defineEmits<{
  insertGif: [url: string];
  insertImage: [url: string];
}>();

const activeTab = ref<MediaTab>('gif');
/** GIF vs image context for the favorites folder (Discord-style per-picker collection). */
const browseKind = ref<'gif' | 'image'>('gif');
const imageTabSeeded = ref(false);
/** Category landing vs search results grid (Discord-style). */
const gifBrowseView = ref<'categories' | 'results'>('categories');
const imageBrowseView = ref<'categories' | 'results'>('categories');
const activeGifCategorySlug = ref<string | null>(null);
const activeImageCategorySlug = ref<string | null>(null);

const {
  query: gifSearchQuery,
  gifs: gifResults,
  loading: gifLoading,
  error: gifError,
  search: searchGifs,
  loadCategory: loadGifCategory,
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
  loadCategory: loadImageCategory,
} = useImageSearch();

const authSession = useAuthSessionStore();
const layoutModals = inject(LAYOUT_MODALS_KEY, null);

const { gifFavorites, imageFavorites, isFavorite, toggleFavorite } =
  useMediaFavorites();

const { categories: imageBrowseCategories, ensureImageBrowseCategories } =
  useImageBrowseCategories();

const favoritesForBrowseKind = computed(() =>
  browseKind.value === 'gif' ? gifFavorites.value : imageFavorites.value,
);

const imageFavoritePreviewUrls = computed(() =>
  imageFavorites.value
    .slice(0, 2)
    .map((f) => f.thumbUrl || f.url)
    .filter(Boolean),
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
const hoveredImageId = ref<string | null>(null);

let gifDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  gifSearchQuery,
  (q) => {
    if (gifDebounceTimer) clearTimeout(gifDebounceTimer);
    const trimmed = q.trim();
    if (!trimmed) {
      gifBrowseView.value = 'categories';
      activeGifCategorySlug.value = null;
      const cached = getCachedGifCategoryResults('trending');
      if (cached?.length) gifResults.value = cached;
      return;
    }
    gifBrowseView.value = 'results';
    const delay = 250;
    gifDebounceTimer = setTimeout(() => searchGifs(q), delay);
  },
  { immediate: false },
);

let imageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  imageSearchQuery,
  (q) => {
    if (imageDebounceTimer) clearTimeout(imageDebounceTimer);
    const trimmed = q.trim();
    if (!trimmed) {
      imageBrowseView.value = 'categories';
      activeImageCategorySlug.value = null;
      return;
    }
    imageBrowseView.value = 'results';
    const delay = 250;
    imageDebounceTimer = setTimeout(() => searchImages(q), delay);
  },
  { immediate: false },
);

watch(imageBrowseCategories, () => {
  if (activeTab.value === 'image') void warmImageCategoryLibrary();
});

watch(activeTab, (tab) => {
  if (tab !== 'image') {
    imageLoadMoreObserver?.disconnect();
    return;
  }
  void ensureImageBrowseCategories().then(() => warmImageCategoryLibrary());
  if (!imageTabSeeded.value) {
    imageTabSeeded.value = true;
    imageBrowseView.value = 'categories';
    imageSearchQuery.value = '';
  }
  queueMicrotask(() => setupImageLoadMoreObserver());
});

function openGifCategory(cat: MediaBrowseCategory) {
  activeGifCategorySlug.value = cat.slug;
  gifBrowseView.value = 'results';
  gifSearchQuery.value = cat.query;
  const cached = getCachedGifCategoryResults(cat.slug);
  if (cached?.length) {
    gifResults.value = cached;
    return;
  }
  void loadGifCategory(cat.slug);
}

function openImageCategory(cat: MediaBrowseCategory) {
  activeImageCategorySlug.value = cat.slug;
  imageBrowseView.value = 'results';
  imageSearchQuery.value = cat.query;
  const cached = getCachedImageCategoryResults(cat.slug);
  if (cached?.length) {
    imageResults.value = cached;
    return;
  }
  void loadImageCategory(cat.slug);
}

function gifCategoryPreviewUrls(slug: string): string[] {
  void gifCategoryLibraryRevision.value;
  return getGifCategoryPreviewUrls(slug);
}

function imageCategoryPreviewUrls(slug: string): string[] {
  void imageCategoryLibraryRevision.value;
  return getImageCategoryPreviewUrls(slug);
}

const popoutRef = ref<HTMLElement | null>(null);
const popoutStyle = ref<Record<string, string>>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  zIndex: '120',
});

function updatePopoutPosition() {
  const anchor = props.anchorEl;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const gap = 8;
  const width = Math.min(400, window.innerWidth - pad * 2);
  const height =
    popoutRef.value?.getBoundingClientRect().height ??
    Math.min(window.innerHeight * 0.55, 416);
  let left = rect.right - width;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
  const placement = props.placement ?? 'up';
  let top = placement === 'down' ? rect.bottom + gap : rect.top - height - gap;
  if (placement === 'up' && top < pad) {
    top = Math.min(rect.bottom + gap, window.innerHeight - height - pad);
  } else if (placement === 'down' && top + height > window.innerHeight - pad) {
    top = Math.max(pad, rect.top - height - gap);
  }
  top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));
  popoutStyle.value = {
    position: 'fixed',
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`,
    zIndex: '120',
  };
}

function bindPopoutViewportListeners() {
  window.addEventListener('resize', updatePopoutPosition);
  window.addEventListener('scroll', updatePopoutPosition, true);
  window.visualViewport?.addEventListener('resize', updatePopoutPosition);
  window.visualViewport?.addEventListener('scroll', updatePopoutPosition);
}

function unbindPopoutViewportListeners() {
  window.removeEventListener('resize', updatePopoutPosition);
  window.removeEventListener('scroll', updatePopoutPosition, true);
  window.visualViewport?.removeEventListener('resize', updatePopoutPosition);
  window.visualViewport?.removeEventListener('scroll', updatePopoutPosition);
}

function backToGifCategories() {
  gifSearchQuery.value = '';
  gifBrowseView.value = 'categories';
  activeGifCategorySlug.value = null;
}

function backToImageCategories() {
  imageSearchQuery.value = '';
  imageBrowseView.value = 'categories';
  activeImageCategorySlug.value = null;
}

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
  gifBrowseView.value = 'categories';
  imageBrowseView.value = 'categories';
  void warmGifCategoryLibrary();
  const trending = getCachedGifCategoryResults('trending');
  if (trending?.length) gifResults.value = trending;
  bindPopoutViewportListeners();
  void nextTick(() => {
    updatePopoutPosition();
    requestAnimationFrame(updatePopoutPosition);
  });
});

onUnmounted(() => {
  unbindPopoutViewportListeners();
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
  if (tab === 'gif') {
    gifBrowseView.value = gifSearchQuery.value.trim()
      ? 'results'
      : 'categories';
  }
  if (tab === 'image') {
    imageBrowseView.value = imageSearchQuery.value.trim()
      ? 'results'
      : 'categories';
    void warmImageCategoryLibrary();
  }
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

function onImageHover(img: { id: string }) {
  hoveredImageId.value = img.id;
}

function onImageLeave() {
  hoveredImageId.value = null;
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

function insertFavorite(fav: MediaFavorite, event: MouseEvent) {
  event.stopPropagation();
  if (fav.kind === 'gif') emit('insertGif', fav.url);
  else emit('insertImage', fav.url);
}

function selectGif(url: string, event: MouseEvent) {
  event.stopPropagation();
  emit('insertGif', url);
}

function selectImage(url: string, event: MouseEvent) {
  event.stopPropagation();
  emit('insertImage', url);
}

function openGifCategoryFromClick(cat: MediaBrowseCategory, event: MouseEvent) {
  event.stopPropagation();
  openGifCategory(cat);
}

function openImageCategoryFromClick(
  cat: MediaBrowseCategory,
  event: MouseEvent,
) {
  event.stopPropagation();
  openImageCategory(cat);
}

function onFavoriteGifHover(fav: MediaFavorite) {
  if (fav.kind !== 'gif') return;
  hoveredGifId.value = fav.id;
  if (fav.previewUrl) prefetchFullUrl(fav.previewUrl);
}

function onFavoriteTileEnter(fav: MediaFavorite) {
  if (fav.kind === 'gif') onFavoriteGifHover(fav);
  else hoveredImageId.value = fav.id;
}

function onFavoriteTileLeave(fav: MediaFavorite) {
  if (fav.kind === 'gif') onGifLeave();
  else onImageLeave();
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

watch(
  () => props.anchorEl,
  () => {
    void nextTick(() => updatePopoutPosition());
  },
);

watch(
  [
    () => props.placement,
    activeTab,
    gifBrowseView,
    imageBrowseView,
    gifResults,
    imageResults,
    () => gifCategoryLibraryRevision.value,
    () => imageCategoryLibraryRevision.value,
  ],
  () => {
    void nextTick(() => updatePopoutPosition());
  },
);

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
  <Teleport to="body">
    <div
      ref="popoutRef"
      data-chat-insert-popout
      class="chat-popout chat-liquid-glass-menu gif-popout overflow-hidden"
      :style="popoutStyle"
      role="menu"
      @mousedown.stop
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
              class="echo-ink-icon h-4 w-4 opacity-90"
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
                class="echo-ink-icon h-10 w-10 opacity-40"
                aria-hidden="true"
              />
              <p
                class="text-sm font-medium"
                :class="
                  props.theme === 'forum'
                    ? 'text-foreground'
                    : 'text-foreground'
                "
              >
                No favorites yet
              </p>
              <p
                class="text-xs leading-snug"
                :class="
                  props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'
                "
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
                @mouseenter="onFavoriteTileEnter(fav)"
                @mouseleave="onFavoriteTileLeave(fav)"
                @focusin="onFavoriteTileEnter(fav)"
                @focusout="onFavoriteTileLeave(fav)"
              >
                <button
                  type="button"
                  role="menuitem"
                  class="h-full w-full transition-colors hover:bg-glass-hover"
                  :title="fav.title"
                  @click="insertFavorite(fav, $event)"
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
                      :force-active="hoveredGifId === fav.id"
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
                  :class="
                    mediaFavoriteStarBtnClass(
                      true,
                      (fav.kind === 'gif' && hoveredGifId === fav.id) ||
                        (fav.kind === 'image' && hoveredImageId === fav.id),
                    )
                  "
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
                ? 'text-foreground placeholder:text-fg-subtle'
                : 'text-foreground placeholder:text-muted'
            "
          />
          <div
            v-if="gifBrowseView === 'categories' && !gifSearchQuery.trim()"
            class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
            v-scrollbar-on-scroll
          >
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="cat in GIF_BROWSE_CATEGORIES"
                :key="cat.slug"
                type="button"
                class="group relative flex aspect-[4/3] flex-col overflow-hidden rounded-lg bg-scrim-1 text-left transition-colors hover:bg-glass-hover"
                @click="openGifCategoryFromClick(cat, $event)"
              >
                <div class="relative min-h-0 flex-1 overflow-hidden">
                  <template v-if="gifCategoryPreviewUrls(cat.slug).length">
                    <img
                      v-for="(previewUrl, pi) in gifCategoryPreviewUrls(
                        cat.slug,
                      )"
                      :key="`${cat.slug}-${pi}`"
                      :src="previewUrl"
                      alt=""
                      class="absolute inset-0 h-full w-full object-cover"
                      :class="
                        pi === 1 ? 'opacity-80 mix-blend-lighten scale-105' : ''
                      "
                      loading="eager"
                      fetchpriority="high"
                      draggable="false"
                    />
                  </template>
                  <div
                    v-else
                    class="flex h-full items-center justify-center text-2xl opacity-60"
                    aria-hidden="true"
                  >
                    {{ cat.navEmoji }}
                  </div>
                  <div
                    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6"
                  >
                    <span class="text-xs font-semibold text-white">{{
                      cat.name
                    }}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
          <div
            v-else
            class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
            v-scrollbar-on-scroll
          >
            <button
              v-if="activeGifCategorySlug && !gifSearchQuery.trim()"
              type="button"
              class="mb-2 text-xs font-medium text-muted hover:text-foreground"
              @click="backToGifCategories"
            >
              ← Categories
            </button>
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
                <circle
                  class="echo-ios-spinner__track"
                  cx="22"
                  cy="22"
                  r="18"
                />
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
                @mouseenter="onGifHover(gif)"
                @mouseleave="onGifLeave"
                @focusin="onGifHover(gif)"
                @focusout="onGifLeave"
              >
                <button
                  type="button"
                  role="menuitem"
                  class="h-full w-full transition-colors hover:bg-glass-hover"
                  :title="gif.title"
                  @click="selectGif(gif.url, $event)"
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
                    :force-active="hoveredGifId === gif.id"
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
                  :class="
                    mediaFavoriteStarBtnClass(
                      isGifFavorited(gif),
                      hoveredGifId === gif.id,
                    )
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
                ? 'text-foreground placeholder:text-fg-subtle'
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
            v-if="imageBrowseView === 'categories' && !imageSearchQuery.trim()"
            class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
            v-scrollbar-on-scroll
          >
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="group relative flex aspect-square flex-col overflow-hidden rounded-lg bg-scrim-1 text-left transition-colors hover:bg-glass-hover"
                @click="setTab('favorites')"
              >
                <template v-if="imageFavoritePreviewUrls.length">
                  <img
                    v-for="(previewUrl, pi) in imageFavoritePreviewUrls"
                    :key="`fav-preview-${pi}`"
                    :src="previewUrl"
                    alt=""
                    class="absolute inset-0 h-full w-full object-cover"
                    :class="
                      pi === 1 ? 'opacity-80 mix-blend-lighten scale-105' : ''
                    "
                    loading="eager"
                    draggable="false"
                  />
                </template>
                <div
                  v-else
                  class="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-indigo-500/20 to-purple-500/10"
                >
                  <img
                    :src="icons.folder"
                    alt=""
                    class="echo-ink-icon h-8 w-8 opacity-80"
                    aria-hidden="true"
                  />
                </div>
                <div
                  class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6"
                >
                  <span class="text-xs font-semibold text-white"
                    >Favorites</span
                  >
                </div>
              </button>
              <button
                v-for="cat in imageBrowseCategories"
                :key="cat.slug"
                type="button"
                class="group relative flex aspect-square flex-col overflow-hidden rounded-lg bg-scrim-1 text-left transition-colors hover:bg-glass-hover"
                @click="openImageCategoryFromClick(cat, $event)"
              >
                <template v-if="imageCategoryPreviewUrls(cat.slug).length">
                  <img
                    :src="imageCategoryPreviewUrls(cat.slug)[0]"
                    alt=""
                    class="h-full w-full object-cover"
                    loading="eager"
                    fetchpriority="high"
                    draggable="false"
                  />
                </template>
                <div
                  v-else
                  class="flex h-full items-center justify-center text-2xl opacity-60"
                  aria-hidden="true"
                >
                  {{ cat.navEmoji }}
                </div>
                <div
                  class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6"
                >
                  <span class="text-xs font-semibold text-white">{{
                    cat.name
                  }}</span>
                </div>
              </button>
            </div>
          </div>
          <div
            v-else
            ref="imageScrollRoot"
            class="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-0"
            v-scrollbar-on-scroll
          >
            <button
              v-if="activeImageCategorySlug && !imageSearchQuery.trim()"
              type="button"
              class="mb-2 text-xs font-medium text-muted hover:text-foreground"
              @click="backToImageCategories"
            >
              ← Categories
            </button>
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
                <circle
                  class="echo-ios-spinner__track"
                  cx="22"
                  cy="22"
                  r="18"
                />
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
                @mouseenter="onImageHover(img)"
                @mouseleave="onImageLeave"
                @focusin="onImageHover(img)"
                @focusout="onImageLeave"
              >
                <button
                  type="button"
                  role="menuitem"
                  class="h-full w-full transition-colors hover:bg-glass-hover"
                  :title="img.alt"
                  @click="selectImage(img.url, $event)"
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
                  :class="
                    mediaFavoriteStarBtnClass(
                      isImageFavorited(img),
                      hoveredImageId === img.id,
                    )
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
                <circle
                  class="echo-ios-spinner__track"
                  cx="22"
                  cy="22"
                  r="18"
                />
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
  </Teleport>
</template>

<style scoped lang="scss">
.chat-popout {
  .chat-popout-inner {
    position: relative;
    background-color: transparent;
  }
}

/* Light mode: white picker chrome + dark text (scrim/glass utilities read as muddy grey). */
:global([data-theme='light']) .gif-popout.chat-liquid-glass-menu {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background-color: #fff;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  box-shadow: none;
  color: var(--text);
}

:global([data-theme='light']) .gif-popout {
  :global(.bg-scrim-1) {
    background-color: #fff !important;
  }

  :global(.bg-scrim-2) {
    background-color: color-mix(in srgb, var(--border) 16%, #fff) !important;
  }

  :global(.text-muted),
  :global(.text-fg-subtle) {
    color: color-mix(in srgb, var(--text) 58%, transparent) !important;
  }

  :global(.text-foreground) {
    color: var(--text) !important;
  }

  [role='tablist'] {
    background-color: color-mix(in srgb, var(--border) 14%, #fff) !important;
  }

  [role='tab'] {
    color: color-mix(in srgb, var(--text) 62%, transparent);

    &[aria-selected='true'] {
      background-color: #fff !important;
      color: var(--text) !important;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 50%, transparent);
    }

    &:hover:not([aria-selected='true']) {
      background-color: color-mix(in srgb, var(--border) 10%, #fff) !important;
      color: var(--text) !important;
    }
  }

  input[type='text'] {
    background-color: #fff !important;
    color: var(--text) !important;
    border: 1px solid color-mix(in srgb, var(--border) 62%, transparent) !important;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;

    &::placeholder {
      color: color-mix(in srgb, var(--text) 42%, transparent);
    }
  }

  button.text-muted:hover {
    color: var(--text) !important;
  }

  button:global(.bg-scrim-1):hover {
    background-color: color-mix(in srgb, var(--border) 10%, #fff) !important;
  }
}
</style>
