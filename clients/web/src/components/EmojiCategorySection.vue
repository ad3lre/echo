<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type {
  EmojiCategory,
  EmojiEntry,
} from '@/features/chat/emoji/useEmojiData';
import GifImage from '@/features/chat/components/GifImage.vue';
import { markCustomEmojiImgLoaded } from '@/features/chat/composables/useCustomEmojiImgLoadRecovery';
import { isLikelyGifImageUrl } from '@/features/chat/isGifImageUrl';
import { getTwemojiSrc } from '@/features/chat/emoji/twemoji';

const props = defineProps<{
  category: EmojiCategory;
  scrollRoot: HTMLElement | null;
  /** When true, show emojis immediately without lazy-loading (for first visible section) */
  priority?: boolean;
  /** Optional active item index for keyboard-selected search result highlighting. */
  activeEmojiIndex?: number;
}>();

const emit = defineEmits<{
  insertEmoji: [entry: EmojiEntry];
  emojiContextMenu: [
    ev: MouseEvent,
    category: EmojiCategory,
    entry: EmojiEntry,
  ];
  emojiCategoryContextMenu: [ev: MouseEvent, category: EmojiCategory];
}>();

function onEmojiCellContextMenu(ev: MouseEvent, entry: EmojiEntry) {
  emit('emojiContextMenu', ev, props.category, entry);
}

function onCategoryHeaderContextMenu(ev: MouseEvent) {
  emit('emojiCategoryContextMenu', ev, props.category);
}

const sectionRef = ref<HTMLElement | null>(null);
const isVisible = ref(props.priority ?? false);
let observer: IntersectionObserver | null = null;
let scrollCleanup: (() => void) | null = null;
let fallbackTimer = 0;

function showEmojis() {
  if (isVisible.value) return;
  isVisible.value = true;
}

function isInView(el: HTMLElement, root: HTMLElement | null): boolean {
  const elRect = el.getBoundingClientRect();
  const rootRect = root
    ? root.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const margin = 120;
  return (
    elRect.bottom >= rootRect.top - margin &&
    elRect.top <= rootRect.bottom + margin
  );
}

function checkAndShow() {
  const el = sectionRef.value;
  const root = props.scrollRoot ?? null;
  if (!el || isVisible.value) return;
  if (isInView(el, root)) showEmojis();
}

function setupObserver() {
  if (props.priority) return; // Priority sections show immediately
  const root = props.scrollRoot ?? null;
  const el = sectionRef.value;
  if (!el) return;

  observer?.disconnect();
  observer = null;
  scrollCleanup?.();
  scrollCleanup = null;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  }

  // Sync check: if already in view, show immediately
  if (isInView(el, root)) {
    showEmojis();
    return;
  }

  // Scroll listener: reliably catches when section enters view on scroll
  if (root) {
    const onScroll = () => {
      checkAndShow();
      if (isVisible.value) {
        scrollCleanup?.();
        scrollCleanup = null;
        observer?.disconnect();
        observer = null;
      }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    scrollCleanup = () => root.removeEventListener('scroll', onScroll);
  }

  // IntersectionObserver as primary (fires on layout changes)
  const observeRoot = root ?? null;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        showEmojis();
        observer?.disconnect();
        observer = null;
        scrollCleanup?.();
        scrollCleanup = null;
      }
    },
    { root: observeRoot, rootMargin: '100px 0px', threshold: 0 },
  );
  observer.observe(el);

  // Fallback: periodic check in case neither fires (e.g. root had 0 height initially)
  fallbackTimer = window.setTimeout(() => {
    if (isVisible.value) return;
    checkAndShow();
    if (isVisible.value) {
      observer?.disconnect();
      observer = null;
      scrollCleanup?.();
      scrollCleanup = null;
    }
    fallbackTimer = 0;
  }, 120);
}

onMounted(() => {
  if (!props.priority) {
    nextTick(setupObserver);
    const stop = watch(
      () => props.scrollRoot,
      () => nextTick(setupObserver),
      { immediate: true },
    );
    onUnmounted(stop);
  }
});

onUnmounted(() => {
  observer?.disconnect();
  scrollCleanup?.();
  if (fallbackTimer) clearTimeout(fallbackTimer);
});
function isStickerGif(entry: EmojiEntry): boolean {
  return (
    entry.kind === 'sticker' &&
    (entry.stickerFormat === 'gif' || isLikelyGifImageUrl(entry.imageUrl))
  );
}

function unicodeEmojiSrc(entry: EmojiEntry): string | null {
  return getTwemojiSrc(entry.emoji);
}

function isCustomOrSticker(entry: EmojiEntry): boolean {
  return entry.kind === 'custom' || entry.kind === 'sticker';
}

function onCustomEmojiImgReady(ev: Event) {
  const img = ev.target;
  if (img instanceof HTMLImageElement) {
    markCustomEmojiImgLoaded(img);
  }
}

function onCustomEmojiImgRef(el: unknown) {
  const img = el instanceof HTMLImageElement ? el : null;
  if (!img) return;
  nextTick(() => {
    if (img.complete && img.naturalWidth > 0) {
      markCustomEmojiImgLoaded(img);
    }
  });
}

const skeletonCellCount = computed(() => {
  const count = props.category.emojis.length;
  if (count <= 0) return 8;
  return Math.min(count, 24);
});
</script>

<template>
  <div ref="sectionRef" class="emoji-section mb-3 first:mt-0">
    <div
      class="emoji-section-header mb-0.5 px-1 py-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
      @contextmenu="onCategoryHeaderContextMenu"
    >
      {{ category.name }}
    </div>
    <div v-if="isVisible" class="emoji-grid">
      <button
        v-for="(entry, i) in category.emojis"
        :key="`${category.slug}-${entry.slug}-${i}`"
        type="button"
        class="emoji-btn"
        :class="{ 'emoji-btn--active': i === props.activeEmojiIndex }"
        :data-search-index="
          props.activeEmojiIndex !== undefined ? String(i) : undefined
        "
        :title="entry.kind === 'sticker' ? `:${entry.name}:` : entry.name"
        @click="emit('insertEmoji', entry)"
        @contextmenu="onEmojiCellContextMenu($event, entry)"
      >
        <GifImage
          v-if="
            entry.kind === 'sticker' && entry.imageUrl && isStickerGif(entry)
          "
          class="emoji-btn__gif"
          :src="entry.imageUrl"
          :alt="`:${entry.name}:`"
        />
        <span
          v-else-if="isCustomOrSticker(entry) && entry.imageUrl"
          class="emoji-btn__custom-wrap custom-emoji-inline custom-emoji-inline--loading"
        >
          <span
            class="custom-emoji-skeleton emoji-btn__skeleton"
            aria-hidden="true"
          />
          <img
            :ref="onCustomEmojiImgRef"
            class="emoji custom-emoji custom-emoji--pending-load"
            :src="entry.imageUrl"
            :alt="`:${entry.name}:`"
            draggable="false"
            loading="lazy"
            decoding="async"
            @load="onCustomEmojiImgReady"
            @error="onCustomEmojiImgReady"
          />
        </span>
        <img
          v-else-if="unicodeEmojiSrc(entry)"
          class="emoji"
          :src="unicodeEmojiSrc(entry)!"
          :alt="entry.name"
          draggable="false"
        />
        <span v-else class="emoji-btn__fallback" v-html="entry.html" />
      </button>
    </div>
    <div
      v-else
      class="emoji-grid"
      role="status"
      aria-live="polite"
      aria-label="Loading emoji section"
    >
      <div
        v-for="n in skeletonCellCount"
        :key="`skeleton-${n}`"
        class="emoji-skeleton"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<style scoped>
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-auto-rows: auto;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

.emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1;
  height: auto;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: center;
  transition: background-color 0.15s;
}

.emoji-btn:hover {
  background: var(--vue-auto-003);
}

.emoji-btn--active {
  background: var(--vue-auto-003);
  box-shadow: inset 0 0 0 2px
    color-mix(in srgb, var(--vue-auto-008) 55%, transparent);
}

.emoji-btn :deep(.emoji),
.emoji-btn .emoji {
  display: block;
  width: 22px;
  height: 22px;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
  flex-shrink: 0;
}

.emoji-btn__fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.emoji-btn__gif {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.emoji-btn__gif :deep(img) {
  display: block;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.emoji-btn__custom-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
}

.emoji-btn__skeleton {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: var(--vue-auto-001);
  animation: emoji-btn-skeleton-pulse 1.2s ease-in-out infinite;
}

.emoji-btn__custom-wrap:not(.custom-emoji-inline--loading)
  .emoji-btn__skeleton {
  display: none;
}

.emoji-btn__custom-wrap :deep(img.custom-emoji--pending-load) {
  opacity: 0;
}

.emoji-skeleton {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1;
  height: auto;
  border-radius: 6px;
  background: var(--vue-auto-001);
  animation: emoji-btn-skeleton-pulse 1.2s ease-in-out infinite;
}

@keyframes emoji-btn-skeleton-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .emoji-btn__skeleton,
  .emoji-skeleton {
    animation: none;
    opacity: 0.7;
  }
}
</style>
