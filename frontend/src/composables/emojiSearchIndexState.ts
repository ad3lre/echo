/**
 * Mutable emoji search index cache — lives in its own module so `useEmojiData` can
 * invalidate without importing `useEmojiSearchIndex` (breaks circular deps).
 */

import type { EmojiEntry } from '@/composables/emojiTypes';

export interface SearchIndex {
  byToken: Map<string, Set<EmojiEntry>>;
  all: EmojiEntry[];
}

export interface PrebuiltEmojiSearchIndex {
  byToken: Record<string, string[]>;
}

let searchIndex: SearchIndex | null = null;
let prebuiltIndex: PrebuiltEmojiSearchIndex | null = null;

/** Call when emoji category data is loaded or replaced (e.g. async unicode-emoji-json). */
export function invalidateEmojiSearchIndex(): void {
  searchIndex = null;
}

export function setPrebuiltSearchIndex(
  data: PrebuiltEmojiSearchIndex | null,
): void {
  prebuiltIndex = data;
  searchIndex = null;
}

export function getCachedEmojiSearchIndex(): SearchIndex | null {
  return searchIndex;
}

export function setCachedEmojiSearchIndex(next: SearchIndex | null): void {
  searchIndex = next;
}

export function getPrebuiltEmojiSearchIndex(): PrebuiltEmojiSearchIndex | null {
  return prebuiltIndex;
}
