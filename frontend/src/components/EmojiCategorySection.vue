<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { EmojiCategory, EmojiEntry } from '@/composables/useEmojiData';
import GifImage from '@/components/chat/GifImage.vue';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';

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
          :src="entry.imageUrl"
          :alt="`:${entry.name}:`"
          wrapper-class="h-[1.35rem] w-[1.35rem] flex items-center justify-center"
          img-class="h-[1.35rem] w-[1.35rem] object-contain"
        />
        <img
          v-else-if="
            (entry.kind === 'custom' || entry.kind === 'sticker') &&
            entry.imageUrl
          "
          class="emoji custom-emoji h-[1.35rem] w-[1.35rem] object-contain"
          :src="entry.imageUrl"
          :alt="`:${entry.name}:`"
          draggable="false"
        />
        <span v-else v-html="entry.html" />
      </button>
    </div>
    <div
      v-else
      class="flex min-h-[2.5rem] w-full items-center justify-center py-2"
      role="status"
      aria-live="polite"
      aria-label="Loading emoji section"
    >
      <svg
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
  </div>
</template>
