/**
 * Emoji picker state: search, categories, section refs, scroll-to-category.
 * Two-phase render: Phase 1 = recently used + first row of first unicode category.
 * Phase 2 = full content on next animation frame.
 */

import { ref, computed, watch, onUnmounted, type Ref } from 'vue';
import type { EmojiEntry, EmojiCategory } from '@/composables/useEmojiData';
import { getEmojiCategories } from '@/composables/useEmojiData';
import { searchEmojis } from '@/composables/useEmojiSearchIndex';
import { parseTwemoji } from '@/utils/twemoji';
import { useRecentlyUsedEmojis } from './useRecentlyUsedEmojis';

const SEARCH_RESULT_LIMIT = 80;
const PHASE1_FIRST_ROW = 8;

function searchCustomByName(
  query: string,
  list: EmojiEntry[],
  limit: number,
): EmojiEntry[] {
  const ql = query.trim().toLowerCase();
  if (!ql) return [];
  const tokens = ql.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const out: EmojiEntry[] = [];
  for (const e of list) {
    if (e.kind !== 'custom' && e.kind !== 'sticker') continue;
    const exact = new Set(
      `${e.name} ${e.slug}`
        .toLowerCase()
        .split(/[\s_-]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (tokens.every((token) => exact.has(token))) {
      out.push(e);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export type UseEmojiPickerOptions = {
  serverId?: Ref<string | undefined>;
  serverPackCategories?: Ref<EmojiCategory[]>;
  stickerPackCategories?: Ref<EmojiCategory[]>;
  customEmojiSearchList?: Ref<EmojiEntry[]>;
  /** Non-empty when the user has personal emoji packs (API phase 2). */
  userPackCategories?: Ref<EmojiCategory[]>;
  /** When false, hide server/custom packs and custom rows in search + recents. */
  allowCustomEmoji?: Ref<boolean>;
};

export function useEmojiPicker(opts?: UseEmojiPickerOptions) {
  const serverIdRef = opts?.serverId ?? ref<string | undefined>(undefined);
  const serverPackCategoriesRef =
    opts?.serverPackCategories ?? ref<EmojiCategory[]>([]);
  const stickerPackCategoriesRef =
    opts?.stickerPackCategories ?? ref<EmojiCategory[]>([]);
  const customEmojiSearchListRef =
    opts?.customEmojiSearchList ?? ref<EmojiEntry[]>([]);
  const userPackCategoriesRef =
    opts?.userPackCategories ?? ref<EmojiCategory[]>([]);
  const allowCustomEmojiRef = opts?.allowCustomEmoji ?? ref(true);

  const { addRecentlyUsed, recentPickerEntries } = useRecentlyUsedEmojis();
  const emojiCategories = computed(() => getEmojiCategories());

  const searchQuery = ref('');
  const debouncedSearchQuery = ref('');
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(searchQuery, (q) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (!q.trim()) {
      debouncedSearchQuery.value = q;
      return;
    }
    searchDebounceTimer = setTimeout(() => {
      debouncedSearchQuery.value = q;
      searchDebounceTimer = null;
    }, 150);
  });

  onUnmounted(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  const scrollContainerRef = ref<HTMLElement | null>(null);
  const sectionRefs = ref<Record<string, HTMLElement>>({});
  const activeCategory = ref<string | null>(null);

  const recentlyUsedCategory = computed<EmojiCategory | null>(() => {
    let entries = recentPickerEntries(serverIdRef.value);
    if (!allowCustomEmojiRef.value) {
      entries = entries.filter((e) => e.kind !== 'custom');
    }
    if (entries.length === 0) return null;
    return {
      name: 'Recently used',
      slug: 'recently-used',
      emojis: [...entries].reverse(),
      navIconHtml: parseTwemoji('🕐'),
    };
  });

  const personalPacksPlaceholder = computed<EmojiCategory>(() => ({
    name: 'Your packs',
    slug: 'your-packs-empty',
    emojis: [],
    navIconHtml: parseTwemoji('🎒'),
  }));

  const browsingCategories = computed(() => {
    const recent = recentlyUsedCategory.value;
    const server = allowCustomEmojiRef.value
      ? serverPackCategoriesRef.value
      : [];
    const stickers = allowCustomEmojiRef.value
      ? stickerPackCategoriesRef.value
      : [];
    const userCats = allowCustomEmojiRef.value
      ? userPackCategoriesRef.value
      : [];
    const personal =
      userCats.length > 0 ? userCats : [personalPacksPlaceholder.value];
    const unicode = emojiCategories.value;
    const parts: EmojiCategory[] = [];
    if (recent) parts.push(recent);
    parts.push(...server);
    parts.push(...stickers);
    if (allowCustomEmojiRef.value) parts.push(...personal);
    parts.push(...unicode);
    return parts;
  });

  const displayedCategories = computed(() => {
    const q = debouncedSearchQuery.value.trim();
    if (!q) return browsingCategories.value;
    const uni = searchEmojis(q, SEARCH_RESULT_LIMIT);
    const custom = allowCustomEmojiRef.value
      ? searchCustomByName(
          q,
          customEmojiSearchListRef.value,
          SEARCH_RESULT_LIMIT,
        )
      : [];
    const seen = new Set<string>();
    const merged: EmojiEntry[] = [];
    for (const e of custom) {
      const k = e.kind === 'custom' ? e.emoji : e.emoji;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(e);
    }
    for (const e of uni) {
      if (seen.has(e.emoji)) continue;
      seen.add(e.emoji);
      merged.push(e);
      if (merged.length >= SEARCH_RESULT_LIMIT) break;
    }
    if (merged.length === 0) return [];
    return [
      {
        name: 'Search results',
        slug: 'search',
        emojis: merged,
        navIconHtml: parseTwemoji('🔍'),
      } satisfies EmojiCategory,
    ];
  });

  const phase2 = ref(false);
  const advanceToPhase2 = () => {
    phase2.value = true;
  };

  function isUnicodeCategorySlug(slug: string): boolean {
    if (
      slug === 'recently-used' ||
      slug === 'your-packs-empty' ||
      slug === 'search'
    )
      return false;
    if (
      slug.startsWith('server-emoji-') ||
      slug.startsWith('server-sticker-') ||
      slug.startsWith('user-emoji-')
    )
      return false;
    return true;
  }

  /** Phase 1: recently used + first row of first unicode category (skip server / personal). */
  const renderedCategories = computed(() => {
    const cats = displayedCategories.value;
    const searching = !!debouncedSearchQuery.value.trim();
    if (phase2.value || searching || cats.length === 0) return cats;
    const result: EmojiCategory[] = [];
    for (const cat of cats) {
      if (cat.slug === 'recently-used') {
        result.push(cat);
        continue;
      }
      if (isUnicodeCategorySlug(cat.slug)) {
        result.push({
          ...cat,
          emojis: cat.emojis.slice(0, PHASE1_FIRST_ROW),
        });
        break;
      }
    }
    return result;
  });

  function setSectionRef(slug: string, el: unknown) {
    if (el) {
      const dom = (el as { $el?: HTMLElement }).$el ?? (el as HTMLElement);
      if (dom) sectionRefs.value[slug] = dom;
    } else {
      delete sectionRefs.value[slug];
    }
  }

  function updateActiveCategory() {
    const root = scrollContainerRef.value;
    if (!root) return;
    const cats = renderedCategories.value;
    if (cats.length === 0) return;
    const rootRect = root.getBoundingClientRect();
    const viewTop = rootRect.top + 40;
    let active: string | null = null;
    for (const cat of cats) {
      const section = sectionRefs.value[cat.slug];
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.top <= viewTop && rect.bottom >= rootRect.top) {
        active = cat.slug;
      }
    }
    activeCategory.value = active ?? cats[0]?.slug ?? null;
  }

  function scrollToCategory(slug: string) {
    const section = sectionRefs.value[slug];
    if (section && scrollContainerRef.value) {
      section.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  let scrollCleanup: (() => void) | null = null;
  watch(
    () => scrollContainerRef.value,
    (el) => {
      scrollCleanup?.();
      scrollCleanup = null;
      if (el) {
        updateActiveCategory();
        const onScroll = () => updateActiveCategory();
        el.addEventListener('scroll', onScroll, { passive: true });
        scrollCleanup = () => el.removeEventListener('scroll', onScroll);
      } else {
        activeCategory.value = null;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    scrollCleanup?.();
  });

  return {
    searchQuery,
    scrollContainerRef,
    browsingCategories,
    displayedCategories,
    renderedCategories,
    activeCategory,
    addRecentlyUsed,
    setSectionRef,
    scrollToCategory,
    advanceToPhase2,
  };
}
