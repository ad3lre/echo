/**
 * :slug: emoji autocomplete for chat input.
 * Detects :query pattern, shows suggestions, replaces on select or : completion.
 */

import { ref, computed, watch } from 'vue';
import {
  searchEmojisBySlugPrefix,
  getEmojiBySlug,
  ensureEmojiSearchPrebuildLoaded,
} from '@/composables/useEmojiSearchIndex';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { appIconEntriesForAutocompleteQuery } from '@/composables/useAppIconSearch';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';

const TRIGGER = /:([a-z0-9_]*)$/i;
const SUGGESTION_LIMIT = 5;
const CANDIDATE_LIMIT = 80;

export type UseEmojiAutocompleteOptions = {
  getCustomEmojiEntries?: () => EmojiEntry[];
  /** Override in-house icon suggestions (default: `appIconEntriesForAutocompleteQuery`). */
  getAppIconEntries?: (query: string) => EmojiEntry[];
};

export function useEmojiAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  replaceRange: (start: number, end: number, text: string) => void,
  options?: UseEmojiAutocompleteOptions,
) {
  const triggerStart = ref<number | null>(null);
  const query = ref('');
  const selectedIndex = ref(0);

  function entrySlugWordCount(entry: EmojiEntry): number {
    return entry.slug.split('_').filter(Boolean).length;
  }

  function entryNameWordCount(entry: EmojiEntry): number {
    return entry.name.split(/\s+/).filter(Boolean).length;
  }

  function autocompleteRankScore(entry: EmojiEntry, qSlug: string): number {
    const slug = entry.slug.toLowerCase();
    const name = entry.name.toLowerCase();
    const qName = qSlug.replace(/_/g, ' ');

    if (slug === qSlug) return 0;
    if (name === qName) return 1;
    if (slug.startsWith(qSlug)) return 2;
    if (name.startsWith(qName)) return 3;
    if (slug.includes(qSlug)) return 4;
    if (name.includes(qName)) return 5;
    return 9;
  }

  function kindRank(entry: EmojiEntry): number {
    // Mixed suggestions: app icons are intentionally ranked below emoji/custom.
    // (Users expect emoji to win even when an icon is an equally-good string match.)
    return entry.kind === 'appIcon' ? 1 : 0;
  }

  const suggestions = computed<EmojiEntry[]>(() => {
    const q = query.value;
    if (!q) return [];

    const qSlug = q.toLowerCase();

    const customs = (options?.getCustomEmojiEntries?.() ?? []).filter((e) => {
      if (e.kind !== 'custom') return false;
      const slug = e.slug.toLowerCase();
      const name = e.name.toLowerCase();
      const qName = qSlug.replace(/_/g, ' ');
      return (
        slug.startsWith(qSlug) ||
        name.startsWith(qName) ||
        slug.includes(qSlug) ||
        name.includes(qName)
      );
    });

    const iconFn =
      options?.getAppIconEntries ??
      ((qq: string) => appIconEntriesForAutocompleteQuery(qq, CANDIDATE_LIMIT));
    const appIcons = iconFn(q);

    const unicode = searchEmojisBySlugPrefix(q, CANDIDATE_LIMIT);

    const combined = [...customs, ...appIcons, ...unicode];
    const deduped: EmojiEntry[] = [];
    const seen = new Set<string>();
    for (const e of combined) {
      if (seen.has(e.emoji)) continue;
      seen.add(e.emoji);
      deduped.push(e);
    }

    deduped.sort((a, b) => {
      const ra = autocompleteRankScore(a, qSlug);
      const rb = autocompleteRankScore(b, qSlug);
      if (ra !== rb) return ra - rb;

      const ka = kindRank(a);
      const kb = kindRank(b);
      if (ka !== kb) return ka - kb;

      const aw = entrySlugWordCount(a);
      const bw = entrySlugWordCount(b);
      if (aw !== bw) return aw - bw;

      const anw = entryNameWordCount(a);
      const bnw = entryNameWordCount(b);
      if (anw !== bnw) return anw - bnw;

      if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.slug.localeCompare(b.slug);
    });

    return deduped.slice(0, SUGGESTION_LIMIT);
  });

  const showPopup = computed(() => {
    return triggerStart.value !== null && suggestions.value.length > 0;
  });

  /** Keep first suggestion selected whenever the list changes (search / custom emoji load). */
  watch(suggestions, () => {
    if (triggerStart.value !== null) selectedIndex.value = 0;
  });

  function updateFromInput() {
    const text = getText();
    const offset = getCursorOffset();
    const before = text.slice(0, offset);
    const match = before.match(TRIGGER);
    if (match) {
      void ensureEmojiSearchPrebuildLoaded();
      void ensureIconCatalogLoaded();
      const nextStart = offset - match[0].length;
      const nextQuery = match[1] ?? '';
      const changed =
        triggerStart.value !== nextStart || query.value !== nextQuery;
      triggerStart.value = nextStart;
      query.value = nextQuery;
      if (changed) selectedIndex.value = 0;
    } else {
      triggerStart.value = null;
      query.value = '';
    }
  }

  function close() {
    triggerStart.value = null;
    query.value = '';
  }

  function currentTriggerRange(): { start: number; end: number } | null {
    const text = getText();
    const offset = getCursorOffset();
    const before = text.slice(0, offset);
    const match = before.match(TRIGGER);
    if (!match) return null;
    const start = offset - match[0].length;
    const end = start + match[0].length;
    return { start, end };
  }

  function triggerRangeFromState(): { start: number; end: number } | null {
    const start = triggerStart.value;
    if (start === null) return null;
    const text = getText();
    if (start < 0 || start >= text.length) return null;
    if (text[start] !== ':') return null;
    const match = text.slice(start).match(/^:([a-z0-9_]*)/i);
    if (!match) return null;
    return { start, end: start + match[0].length };
  }

  function replaceWith(emoji: string) {
    const cursorRange = currentTriggerRange();
    const stateRange = triggerRangeFromState();
    const range =
      cursorRange && stateRange && cursorRange.start === stateRange.start
        ? {
            start: cursorRange.start,
            end: Math.max(cursorRange.end, stateRange.end),
          }
        : (cursorRange ?? stateRange);
    const start = range?.start ?? triggerStart.value;
    const end = range?.end ?? getCursorOffset();
    if (start === null) return;
    replaceRange(start, end, emoji);
    close();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    replaceWith(list[idx]!.emoji);
  }

  function handleKeydown(e: KeyboardEvent): boolean {
    updateFromInput();
    if (!showPopup.value) return false;

    if (e.key === 'Escape') {
      close();
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      selectCurrent();
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        suggestions.value.length - 1,
      );
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      return true;
    }
    if (e.key === ':') {
      const exactUnicode = getEmojiBySlug(query.value);
      if (exactUnicode) {
        e.preventDefault();
        replaceWith(exactUnicode.emoji);
        return true;
      }
      const exactCustom = (options?.getCustomEmojiEntries?.() ?? []).find(
        (en) => en.kind === 'custom' && en.name === query.value,
      );
      if (exactCustom?.kind === 'custom') {
        e.preventDefault();
        replaceWith(exactCustom.emoji);
        return true;
      }
      const iconFn =
        options?.getAppIconEntries ??
        ((qq: string) =>
          appIconEntriesForAutocompleteQuery(qq, CANDIDATE_LIMIT));
      const exactAppIcon = iconFn(query.value).find(
        (en) => en.kind === 'appIcon' && en.slug === query.value,
      );
      if (exactAppIcon?.kind === 'appIcon') {
        e.preventDefault();
        replaceWith(exactAppIcon.emoji);
        return true;
      }
    }
    return false;
  }

  return {
    triggerStart,
    query,
    suggestions,
    showPopup,
    selectedIndex,
    updateFromInput,
    close,
    select: replaceWith,
    selectCurrent,
    handleKeydown,
  };
}
