/**
 * Preloads Twemoji images when the emoji picker first opens (not on app init).
 * Warms recently used + first grid of the first category only—no idle bulk preload.
 */

import { getEmojiCategories } from '@/composables/useEmojiData';
import { useRecentlyUsedEmojis } from '@/composables/useRecentlyUsedEmojis';
import { getTwemojiSrc } from '@/utils/twemoji';

/** Matches first visible picker rows without loading the full set. */
const PRIORITY_COUNT = 32;

let didPreload = false;

function toUrl(emoji: string): string | null {
  return getTwemojiSrc(emoji);
}

/** Call when an emoji picker / popover opens; runs once per session. */
export function preloadEmojiImagesOnce(): void {
  if (didPreload) return;
  didPreload = true;

  const categories = getEmojiCategories();
  const { recentlyUsed } = useRecentlyUsedEmojis();
  const urls = new Set<string>();

  for (const e of recentlyUsed.value) {
    if (e.kind === 'custom') {
      urls.add(e.url);
      continue;
    }
    const url = toUrl(e.emoji);
    if (url) urls.add(url);
  }

  if (categories.length > 0) {
    const cat = categories[0]!;
    const take = Math.min(PRIORITY_COUNT, cat.emojis.length);
    for (let j = 0; j < take; j++) {
      const url = toUrl(cat.emojis[j]!.emoji);
      if (url) urls.add(url);
    }
  }

  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}
