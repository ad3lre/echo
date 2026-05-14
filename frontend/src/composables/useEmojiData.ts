/**
 * Emoji data and categories for the picker.
 * Full `unicode-emoji-json` loads asynchronously on first use (or from localStorage cache at init).
 * Precomputes Twemoji HTML once built to avoid parse-on-render lag.
 */

import { shallowRef } from 'vue';
import { getTwemojiSrc } from '@/utils/twemoji';
import { invalidateEmojiSearchIndex } from '@/composables/emojiSearchIndexState';

const CACHE_KEY = 'echo-emoji-v2';
const SAFE_HTML = /^<img\s[^>]*>$/i;
const HAS_EMOJI_CLASS = /class="emoji"/;
const HAS_TWEMOJI_SRC = /src="[^"]*twemoji\/[^"]+\.webp"/;
const UNSAFE_PATTERN = /<script|javascript:|on\w+=/i;

const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

export function parseEmoji(emoji: string): string {
  const src = getTwemojiSrc(emoji);
  if (!src) return emoji;
  const alt = escapeHtml(emoji);
  return `<img class="emoji" draggable="false" alt="${alt}" src="${escapeHtml(src)}"/>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

import type { EmojiCategory, EmojiEntry } from '@/composables/emojiTypes';

export type { EmojiCategory, EmojiEntry } from '@/composables/emojiTypes';
const categoryNavEmoji: Record<string, string> = {
  'Smileys & Emotion': '😀',
  'People & Body': '👋',
  'Animals & Nature': '🐶',
  'Food & Drink': '🍕',
  'Travel & Places': '✈️',
  Activities: '⚽',
  Objects: '💡',
  Symbols: '❤️',
  Flags: '🏳️',
};

export function buildCategories(
  raw: Array<{
    name: string;
    slug: string;
    emojis: Omit<EmojiEntry, 'html'>[];
  }>,
): EmojiCategory[] {
  return raw.map((cat) => ({
    name: cat.name,
    slug: cat.slug,
    navIconHtml: parseEmoji(
      categoryNavEmoji[cat.name] ?? cat.emojis[0]?.emoji ?? '❓',
    ),
    emojis: cat.emojis.map((e) => ({
      ...e,
      html: parseEmoji(e.emoji),
    })),
  }));
}

export function isSafeHtml(html: unknown): html is string {
  if (typeof html !== 'string') return false;
  const t = html.trim();
  if (
    !SAFE_HTML.test(t) ||
    !HAS_EMOJI_CLASS.test(t) ||
    !HAS_TWEMOJI_SRC.test(t)
  )
    return false;
  if (UNSAFE_PATTERN.test(t)) return false;
  return true;
}

function validateCached(data: unknown): data is EmojiCategory[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  for (const cat of data) {
    if (typeof cat?.name !== 'string' || typeof cat?.slug !== 'string')
      return false;
    if (!Array.isArray(cat.emojis)) return false;
    for (const e of cat.emojis) {
      if (typeof e?.emoji !== 'string' || typeof e?.slug !== 'string')
        return false;
      if (!isSafeHtml(e.html)) return false;
    }
    if (!isSafeHtml(cat.navIconHtml)) return false;
  }
  return true;
}

function loadFromCache(): EmojiCategory[] | null {
  try {
    const slugsJson = localStorage.getItem(CACHE_KEY + '-slugs');
    if (!slugsJson) {
      const s = localStorage.getItem(CACHE_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s) as unknown;
      if (!validateCached(parsed)) return null;
      return parsed;
    }
    const slugs = JSON.parse(slugsJson) as string[];
    if (!Array.isArray(slugs)) return null;
    const categories: EmojiCategory[] = [];
    for (const slug of slugs) {
      const s = localStorage.getItem(CACHE_KEY + '-' + slug);
      if (!s) return null;
      const cat = JSON.parse(s) as unknown;
      if (!validateCached([cat])) return null;
      categories.push(cat as EmojiCategory);
    }
    return categories;
  } catch {
    return null;
  }
}

function scheduleCacheWrite(categories: EmojiCategory[]) {
  const writeOne = (i: number) => {
    if (i >= categories.length) {
      try {
        localStorage.setItem(
          CACHE_KEY + '-slugs',
          JSON.stringify(categories.map((c) => c.slug)),
        );
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      localStorage.setItem(
        CACHE_KEY + '-' + categories[i]!.slug,
        JSON.stringify(categories[i]),
      );
    } catch {
      /* ignore */
    }
    const next = () => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => writeOne(i + 1), { timeout: 500 });
      } else {
        setTimeout(() => writeOne(i + 1), 50);
      }
    };
    next();
  };

  setTimeout(() => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => writeOne(0), { timeout: 2000 });
    } else {
      setTimeout(() => writeOne(0), 200);
    }
  }, 1000);
}

const categoriesRef = shallowRef<EmojiCategory[]>(loadFromCache() ?? []);

let loadPromise: Promise<void> | null = null;

/** Loads full emoji set from JSON if not in memory (cache miss). Idempotent. */
export async function ensureEmojiCategoriesLoaded(): Promise<void> {
  if (categoriesRef.value.length > 0) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const again = loadFromCache();
    if (again && again.length > 0) {
      categoriesRef.value = again;
      invalidateEmojiSearchIndex();
      return;
    }
    const mod = await import('unicode-emoji-json/data-by-group.json');
    const raw = mod.default as unknown as Array<{
      name: string;
      slug: string;
      emojis: Omit<EmojiEntry, 'html'>[];
    }>;
    const built = buildCategories(raw);
    categoriesRef.value = built;
    scheduleCacheWrite(built);
    invalidateEmojiSearchIndex();
  })();
  return loadPromise;
}

export function getEmojiCategories(): EmojiCategory[] {
  return categoriesRef.value;
}
