/**
 * Preindexed emoji search for instant lookup.
 * Uses build-time index (emoji-search-index.json) when available.
 */

import type { EmojiEntry } from '@/features/chat/emoji/emojiTypes';
import {
  ensureEmojiCategoriesLoaded,
  getEmojiCategories,
} from '@/features/chat/emoji/useEmojiData';
import {
  getCachedEmojiSearchIndex,
  getPrebuiltEmojiSearchIndex,
  setCachedEmojiSearchIndex,
  setPrebuiltSearchIndex,
  type SearchIndex,
} from '@/features/chat/emoji/emojiSearchIndexState';
import secondaryAliasesJson from '@/features/chat/emoji/emoji-secondary-aliases.json';
import { publicAssetUrl } from '@/features/chat/emoji/twemoji';

export type { SearchIndex } from '@/features/chat/emoji/emojiSearchIndexState';
export {
  invalidateEmojiSearchIndex,
  setPrebuiltSearchIndex,
} from '@/features/chat/emoji/emojiSearchIndexState';

/** Extra search terms for the main 500 chat emoji (see scripts/build-emoji-secondary-aliases.mjs). */
const SECONDARY_ALIASES: Readonly<Record<string, readonly string[]>> =
  secondaryAliasesJson;

interface PrebuiltIndex {
  byToken: Record<string, string[]>;
}

const SLUG_ALIASES: Readonly<Record<string, string>> = {
  // Common Slack/compact aliases.
  sob: 'loudly_crying_face',
  poop: 'pile_of_poo',
};

let prebuildLoadPromise: Promise<void> | null = null;

/**
 * Loads `emoji-search-index.json` lazily (not on app boot) so it stays off the LCP critical path.
 * Ensures full emoji categories exist first (unicode-emoji-json or cache), then fetches prebuild.
 * Call when the emoji picker opens or when the user starts a `:slug` autocomplete.
 */
export function ensureEmojiSearchPrebuildLoaded(): Promise<void> {
  if (getPrebuiltEmojiSearchIndex() !== null) return Promise.resolve();
  if (!prebuildLoadPromise) {
    prebuildLoadPromise = (async () => {
      await ensureEmojiCategoriesLoaded();
      try {
        const res = await fetch(publicAssetUrl('emoji-search-index.json'));
        if (res.ok) {
          setPrebuiltSearchIndex((await res.json()) as PrebuiltIndex);
        }
      } catch {
        /* fall through to runtime index in getEmojiSearchIndex */
      }
      getEmojiSearchIndex();
    })();
  }
  return prebuildLoadPromise;
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s_-]+/).filter(Boolean);
  const slugs = lower.split('_').filter((s) => s.length > 1);
  const combined = new Set<string>();
  for (const w of words) {
    if (w.length >= 2) combined.add(w);
  }
  for (const s of slugs) {
    if (s.length >= 2) combined.add(s);
  }
  return [...combined];
}

function normalizeSlugInput(slug: string): string {
  return slug.trim().toLowerCase().replace(/\s/g, '_');
}

function resolveSlugAlias(slug: string): string {
  const resolved = SLUG_ALIASES[slug];
  return resolved ?? slug;
}

const FUZZY_MIN_LEN = 3;
const FUZZY_EDIT_MIN_WORD = 4;
/** Shorter side must be this long for overlap (avoids "the" ⊂ "theme"). */
const FUZZY_OVERLAP_SHORT_MIN = 4;

/** True if at most one insert/delete/substitution (strings similar length). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === 0 || lb === 0) return la + lb <= 1;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (edits >= 1) return false;
    edits++;
    if (la > lb) i++;
    else if (la < lb) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Bidirectional substring on tokens (e.g. query `plane` inside `airplane`). */
function tokenOverlapsFuzzy(a: string, b: string): boolean {
  if (a.length < FUZZY_MIN_LEN || b.length < FUZZY_MIN_LEN) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (!long.includes(short)) return false;
  if (short === long) return true;
  return short.length >= FUZZY_OVERLAP_SHORT_MIN;
}

function secondaryAliasesFor(entry: EmojiEntry): readonly string[] {
  return SECONDARY_ALIASES[entry.slug] ?? [];
}

function fuzzyMatchesWord(word: string, token: string): boolean {
  if (word.length < FUZZY_MIN_LEN || token.length < FUZZY_MIN_LEN) return false;
  if (tokenOverlapsFuzzy(word, token)) return true;
  if (
    word.length >= FUZZY_EDIT_MIN_WORD &&
    token.length >= FUZZY_EDIT_MIN_WORD &&
    Math.abs(word.length - token.length) <= 1 &&
    withinOneEdit(word, token)
  ) {
    return true;
  }
  return false;
}

function wordMatchesSecondaryTerms(entry: EmojiEntry, word: string): boolean {
  const extra = secondaryAliasesFor(entry);
  if (extra.length === 0) return false;

  if (word.length === 1) {
    return extra.some((a) => a.toLowerCase().startsWith(word));
  }

  for (const phrase of extra) {
    const pl = phrase.toLowerCase();
    if (pl.includes(word)) return true;
    for (const part of pl.split(/\s+/)) {
      if (!part) continue;
      if (part.startsWith(word)) return true;
      if (fuzzyMatchesWord(word, part)) return true;
    }
  }
  return false;
}

/** Loose match for picker search: substring / token-prefix, not full-token-only. */
function wordMatchesEmojiSearch(entry: EmojiEntry, word: string): boolean {
  if (word.length === 0) return true;
  const slug = entry.slug.toLowerCase();
  const name = entry.name.toLowerCase();
  const slugAsWords = slug.replace(/_/g, ' ');

  if (word.length === 1) {
    return (
      slug.startsWith(word) ||
      name.split(/\s+/).some((t) => t.startsWith(word)) ||
      slug.split('_').some((t) => t.startsWith(word)) ||
      wordMatchesSecondaryTerms(entry, word)
    );
  }

  if (
    slug.includes(word) ||
    name.includes(word) ||
    slugAsWords.includes(word)
  ) {
    return true;
  }

  if (slug.split('_').some((part) => part.startsWith(word))) return true;
  if (name.split(/\s+/).some((part) => part.startsWith(word))) return true;

  if (wordMatchesSecondaryTerms(entry, word)) return true;

  for (const part of slug.split('_').filter(Boolean)) {
    if (fuzzyMatchesWord(word, part)) return true;
  }
  for (const part of name.split(/\s+/).filter(Boolean)) {
    if (fuzzyMatchesWord(word, part)) return true;
  }

  return false;
}

function entrySlugWordCount(entry: EmojiEntry): number {
  return entry.slug.split('_').filter(Boolean).length;
}

function entryNameWordCount(entry: EmojiEntry): number {
  return entry.name.split(/\s+/).filter(Boolean).length;
}

export function parseEmojiSearchWords(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => resolveSlugAlias(normalizeSlugInput(w)));
}

/** Lower score = higher relevance (shown first). */
export function searchRankScore(entry: EmojiEntry, words: string[]): number {
  if (words.length === 0) return 99;
  const slug = entry.slug.toLowerCase();
  const name = entry.name.toLowerCase();
  const first = words[0]!;
  const joined = words.join('_');

  if (slug === joined) return 0;
  if (words.length === 1 && slug === first) return 0;
  if (
    words.length === 1 &&
    secondaryAliasesFor(entry).some((a) => a.toLowerCase() === first)
  ) {
    return 1;
  }
  if (slug.startsWith(first)) return 2;
  if (name.startsWith(first)) return 3;
  if (slug.includes(first)) return 4;
  if (name.includes(first)) return 5;
  return 6;
}

/** Shared sort for picker search and :slug: autocomplete (lower = more relevant). */
export function compareEmojiSearchResults(
  a: EmojiEntry,
  b: EmojiEntry,
  words: string[],
): number {
  const ra = searchRankScore(a, words);
  const rb = searchRankScore(b, words);
  if (ra !== rb) return ra - rb;
  const aw = entrySlugWordCount(a);
  const bw = entrySlugWordCount(b);
  if (aw !== bw) return aw - bw;
  const anw = entryNameWordCount(a);
  const bnw = entryNameWordCount(b);
  if (anw !== bnw) return anw - bnw;
  if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.slug.localeCompare(b.slug);
}

function buildIndexFromRuntime(): SearchIndex {
  const byToken = new Map<string, Set<EmojiEntry>>();
  const all: EmojiEntry[] = [];

  const add = (token: string, entry: EmojiEntry) => {
    let set = byToken.get(token);
    if (!set) {
      set = new Set();
      byToken.set(token, set);
    }
    set.add(entry);
  };

  for (const cat of getEmojiCategories()) {
    for (const e of cat.emojis) {
      all.push(e);
      for (const token of tokenize(e.name)) add(token, e);
      for (const token of tokenize(e.slug)) add(token, e);
      for (const alias of secondaryAliasesFor(e)) {
        for (const token of tokenize(alias)) add(token, e);
      }
    }
  }

  return { byToken, all };
}

function buildIndexFromPrebuilt(): SearchIndex {
  const prebuilt = getPrebuiltEmojiSearchIndex();
  const emojiLookup = new Map<string, EmojiEntry>();
  const all: EmojiEntry[] = [];
  const seenAll = new Set<string>();
  for (const cat of getEmojiCategories()) {
    for (const e of cat.emojis) {
      emojiLookup.set(e.emoji, e);
      if (!seenAll.has(e.emoji)) {
        seenAll.add(e.emoji);
        all.push(e);
      }
    }
  }

  const byToken = new Map<string, Set<EmojiEntry>>();

  for (const [token, emojis] of Object.entries(prebuilt!.byToken)) {
    const set = new Set<EmojiEntry>();
    for (const emoji of emojis) {
      const entry = emojiLookup.get(emoji);
      if (entry) {
        set.add(entry);
      }
    }
    if (set.size > 0) byToken.set(token, set);
  }

  return { byToken, all };
}

export function getEmojiSearchIndex(): SearchIndex {
  const cached = getCachedEmojiSearchIndex();
  if (cached) return cached;
  const next = getPrebuiltEmojiSearchIndex()
    ? buildIndexFromPrebuilt()
    : buildIndexFromRuntime();
  setCachedEmojiSearchIndex(next);
  return next;
}

function intersectEmojiSets(
  a: Set<EmojiEntry>,
  b: Set<EmojiEntry>,
): Set<EmojiEntry> {
  if (a.size === 0 || b.size === 0) return new Set();
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  const out = new Set<EmojiEntry>();
  for (const entry of smaller) {
    if (larger.has(entry)) out.add(entry);
  }
  return out;
}

function gatherCandidatesForWord(
  index: SearchIndex,
  word: string,
): Set<EmojiEntry> {
  const out = new Set<EmojiEntry>();
  if (word.length === 0) return out;

  const exact = index.byToken.get(word);
  if (exact) {
    for (const entry of exact) out.add(entry);
  }

  if (word.length >= 2) {
    for (const [token, entries] of index.byToken) {
      if (token === word) continue;
      if (
        token.startsWith(word) ||
        (word.length >= 3 && token.includes(word))
      ) {
        for (const entry of entries) out.add(entry);
      }
    }
  }

  if (out.size === 0 || word.length === 1) {
    for (const entry of index.all) {
      if (wordMatchesEmojiSearch(entry, word)) out.add(entry);
    }
    return out;
  }

  for (const entry of [...out]) {
    if (!wordMatchesEmojiSearch(entry, word)) out.delete(entry);
  }
  return out;
}

/**
 * Search emojis by query: each word must match (substring / prefix on name or slug),
 * with simple relevance ranking — similar to a typical search box.
 */
export function searchEmojis(query: string, limit = 80): EmojiEntry[] {
  const words = parseEmojiSearchWords(query);
  if (words.length === 0) return [];

  const index = getEmojiSearchIndex();
  let matched: Set<EmojiEntry> | null = null;
  for (const word of words) {
    const set = gatherCandidatesForWord(index, word);
    matched = matched == null ? set : intersectEmojiSets(matched, set);
    if (matched.size === 0) return [];
  }

  const arr = [...(matched ?? [])];
  arr.sort((a, b) => compareEmojiSearchResults(a, b, words));

  return arr.slice(0, limit);
}

/**
 * Search emojis by :slug: prefix for autocomplete. Returns emojis whose slug
 * starts with or equals the query. Exact match first, then prefix.
 */
export function searchEmojisBySlugPrefix(
  query: string,
  limit = 5,
): EmojiEntry[] {
  const q = normalizeSlugInput(query);
  if (!q) return [];

  const index = getEmojiSearchIndex();
  const exact: EmojiEntry[] = [];
  const prefix: EmojiEntry[] = [];
  const seen = new Set<string>();

  const aliasResolved = resolveSlugAlias(q);
  if (aliasResolved !== q) {
    const aliasEntry =
      index.all.find((e) => e.slug.toLowerCase() === aliasResolved) ?? null;
    if (aliasEntry) {
      exact.push(aliasEntry);
      seen.add(aliasEntry.emoji);
    }
  }

  const slugCandidates = index.byToken.get(q);
  if (slugCandidates) {
    for (const e of slugCandidates) {
      const slug = e.slug.toLowerCase();
      if (slug === q && !seen.has(e.emoji)) {
        exact.push(e);
        seen.add(e.emoji);
      } else if (slug.startsWith(q) && !seen.has(e.emoji)) {
        prefix.push(e);
        seen.add(e.emoji);
      }
    }
  }

  if (exact.length + prefix.length < limit) {
    for (const e of index.all) {
      if (seen.has(e.emoji)) continue;
      const slug = e.slug.toLowerCase();
      if (slug === q) exact.push(e);
      else if (slug.startsWith(q)) prefix.push(e);
      seen.add(e.emoji);
      if (exact.length + prefix.length >= limit * 2) break;
    }
  }

  prefix.sort((a, b) => {
    const aw = entrySlugWordCount(a);
    const bw = entrySlugWordCount(b);
    if (aw !== bw) return aw - bw;
    if (a.slug.length !== b.slug.length) return a.slug.length - b.slug.length;
    return a.slug.localeCompare(b.slug);
  });

  return [...exact, ...prefix].slice(0, limit);
}

/** Get emoji by exact slug, e.g. "skull" -> 💀 */
export function getEmojiBySlug(slug: string): EmojiEntry | null {
  const s = resolveSlugAlias(normalizeSlugInput(slug));
  if (!s) return null;
  const index = getEmojiSearchIndex();
  return index.all.find((e) => e.slug.toLowerCase() === s) ?? null;
}
