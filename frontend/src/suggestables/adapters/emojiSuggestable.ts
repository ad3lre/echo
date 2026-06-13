/**
 * Emoji `:slug:` suggestable — reference adapter for {@link useSuggestable}.
 * Powers {@link useEmojiAutocomplete} without changing its public API.
 */

import {
  searchEmojis,
  compareEmojiSearchResults,
  parseEmojiSearchWords,
  getEmojiBySlug,
  ensureEmojiSearchPrebuildLoaded,
} from '@/composables/useEmojiSearchIndex';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { appIconEntriesForAutocompleteQuery } from '@/composables/useAppIconSearch';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import { useSuggestable } from '@/suggestables/useSuggestable';
import type {
  SuggestableConfig,
  SuggestableInputContext,
  SuggestableSelectionRange,
  SuggestableSession,
} from '@/suggestables/types';

/** Optional trailing `:` so `:sob` and `:sob:` share the same query and replace span. */
const EMOJI_TRIGGER = /:([a-z0-9_]*):?$/i;
const EMOJI_TRIGGER_FROM_START = /^:([a-z0-9_]*):?/i;
const SUGGESTION_LIMIT = 5;
const CANDIDATE_LIMIT = 80;

export type EmojiSuggestableOptions = {
  getCustomEmojiEntries?: () => EmojiEntry[];
  /** Override in-house icon suggestions (default: `appIconEntriesForAutocompleteQuery`). */
  getAppIconEntries?: (query: string) => EmojiEntry[];
};

function kindRank(entry: EmojiEntry): number {
  return entry.kind === 'appIcon' ? 1 : 0;
}

function detectEmojiTrigger(
  ctx: SuggestableInputContext,
): { start: number; query: string } | null {
  const before = ctx.text.slice(0, ctx.cursor);
  const match = before.match(EMOJI_TRIGGER);
  if (!match) return null;
  return {
    start: ctx.cursor - match[0].length,
    query: match[1] ?? '',
  };
}

function emojiSuggestions(
  query: string,
  options?: EmojiSuggestableOptions,
): EmojiEntry[] {
  const qSlug = query.toLowerCase();

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
  const appIcons = iconFn(query);

  const searchWords = parseEmojiSearchWords(query);
  const unicode = searchEmojis(query, CANDIDATE_LIMIT);

  const combined = [...customs, ...appIcons, ...unicode];
  const deduped: EmojiEntry[] = [];
  const seen = new Set<string>();
  for (const e of combined) {
    if (seen.has(e.emoji)) continue;
    seen.add(e.emoji);
    deduped.push(e);
  }

  deduped.sort((a, b) => {
    const cmp = compareEmojiSearchResults(a, b, searchWords);
    if (cmp !== 0) return cmp;
    const ka = kindRank(a);
    const kb = kindRank(b);
    if (ka !== kb) return ka - kb;
    return 0;
  });

  return deduped.slice(0, SUGGESTION_LIMIT);
}

function currentEmojiTriggerRange(
  ctx: SuggestableInputContext,
): SuggestableSelectionRange | null {
  const before = ctx.text.slice(0, ctx.cursor);
  const match = before.match(EMOJI_TRIGGER);
  if (!match) return null;
  const start = ctx.cursor - match[0].length;
  return { start, end: start + match[0].length };
}

function emojiTriggerRangeFromState(
  ctx: SuggestableInputContext,
  triggerStart: number,
): SuggestableSelectionRange | null {
  if (triggerStart < 0 || triggerStart >= ctx.text.length) return null;
  if (ctx.text[triggerStart] !== ':') return null;
  const match = ctx.text.slice(triggerStart).match(EMOJI_TRIGGER_FROM_START);
  if (!match) return null;
  return { start: triggerStart, end: triggerStart + match[0].length };
}

/** When the caret sits before a typed closing `:`, still consume `:slug:`. */
function extendRangeForTrailingColon(
  ctx: SuggestableInputContext,
  range: SuggestableSelectionRange,
): SuggestableSelectionRange {
  const token = ctx.text.slice(range.start, range.end);
  if (/^:[a-z0-9_]+$/i.test(token) && ctx.text[range.end] === ':') {
    return { start: range.start, end: range.end + 1 };
  }
  return range;
}

function resolveEmojiSelectionRange(
  ctx: SuggestableInputContext,
  triggerStart: number,
): SuggestableSelectionRange | null {
  const cursorRange = currentEmojiTriggerRange(ctx);
  const stateRange = emojiTriggerRangeFromState(ctx, triggerStart);
  let range: SuggestableSelectionRange | null;
  if (cursorRange && stateRange && cursorRange.start === stateRange.start) {
    range = {
      start: cursorRange.start,
      end: Math.max(cursorRange.end, stateRange.end),
    };
  } else {
    range = cursorRange ?? stateRange;
  }
  return range ? extendRangeForTrailingColon(ctx, range) : null;
}

export function createEmojiSuggestableConfig(
  replaceRange: (start: number, end: number, text: string) => void,
  options?: EmojiSuggestableOptions,
): SuggestableConfig<EmojiEntry> {
  return {
    detectTrigger: detectEmojiTrigger,
    getSuggestions: (query) => emojiSuggestions(query, options),
    resolveSelectionRange: resolveEmojiSelectionRange,
    applySelection: (entry, range) => {
      replaceRange(range.start, range.end, entry.emoji);
    },
    onTriggerOpen: () => {
      void ensureEmojiSearchPrebuildLoaded();
      void ensureIconCatalogLoaded();
    },
    handleKeydownExtra: (e, { query, select }) => {
      if (e.key !== ':') return false;

      const exactUnicode = getEmojiBySlug(query);
      if (exactUnicode) {
        e.preventDefault();
        select(exactUnicode);
        return true;
      }

      const exactCustom = (options?.getCustomEmojiEntries?.() ?? []).find(
        (en) => en.kind === 'custom' && en.name === query,
      );
      if (exactCustom?.kind === 'custom') {
        e.preventDefault();
        select(exactCustom);
        return true;
      }

      const iconFn =
        options?.getAppIconEntries ??
        ((qq: string) =>
          appIconEntriesForAutocompleteQuery(qq, CANDIDATE_LIMIT));
      const exactAppIcon = iconFn(query).find(
        (en) => en.kind === 'appIcon' && en.slug === query,
      );
      if (exactAppIcon?.kind === 'appIcon') {
        e.preventDefault();
        select(exactAppIcon);
        return true;
      }

      return false;
    },
  };
}

/** Emoji session via suggestables; `select` accepts an entry or insert string. */
export function useEmojiSuggestable(
  getText: () => string,
  getCursorOffset: () => number,
  replaceRange: (start: number, end: number, text: string) => void,
  options?: EmojiSuggestableOptions,
): SuggestableSession<EmojiEntry> & {
  select: (entryOrInsert: EmojiEntry | string) => void;
} {
  const session = useSuggestable(
    getText,
    getCursorOffset,
    createEmojiSuggestableConfig(replaceRange, options),
  );

  function select(entryOrInsert: EmojiEntry | string) {
    if (typeof entryOrInsert === 'string') {
      const start = session.triggerStart.value;
      if (start === null) return;
      const ctx: SuggestableInputContext = {
        text: getText(),
        cursor: getCursorOffset(),
      };
      const range = resolveEmojiSelectionRange(ctx, start);
      if (!range) return;
      replaceRange(range.start, range.end, entryOrInsert);
      session.close();
      return;
    }
    session.select(entryOrInsert);
  }

  return { ...session, select };
}
