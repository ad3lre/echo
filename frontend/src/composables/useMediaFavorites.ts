/**
 * Saved GIF / image search picks (Discord-style favorites folder in the media popout).
 * Persisted per browser via localStorage.
 */

import { ref, computed } from 'vue';
import type { GifResult } from '@/composables/useGifSearch';
import type { ImageSearchResult } from '@/composables/useImageSearch';

export type MediaFavoriteKind = 'gif' | 'image';

export interface MediaFavorite {
  id: string;
  kind: MediaFavoriteKind;
  url: string;
  thumbUrl: string;
  /** Animated GIF preview for hover in the grid. */
  previewUrl?: string;
  title: string;
  savedAt: number;
}

const STORAGE_KEY = 'echo-media-favorites-v1';
const MAX_FAVORITES = 200;

function stableId(
  kind: MediaFavoriteKind,
  sourceId: string,
  url: string,
): string {
  const base = sourceId.trim() || url.trim();
  return `${kind}:${base}`;
}

function load(): MediaFavorite[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: MediaFavorite[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Partial<MediaFavorite>;
      if (o.kind !== 'gif' && o.kind !== 'image') continue;
      const url = typeof o.url === 'string' ? o.url.trim() : '';
      if (!url) continue;
      const thumbUrl =
        typeof o.thumbUrl === 'string' && o.thumbUrl.trim()
          ? o.thumbUrl.trim()
          : url;
      const id =
        typeof o.id === 'string' && o.id.trim()
          ? o.id.trim()
          : stableId(o.kind, '', url);
      out.push({
        id,
        kind: o.kind,
        url,
        thumbUrl,
        previewUrl:
          typeof o.previewUrl === 'string' && o.previewUrl.trim()
            ? o.previewUrl.trim()
            : undefined,
        title: typeof o.title === 'string' ? o.title : '',
        savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
      });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

function save(list: MediaFavorite[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(0, MAX_FAVORITES)),
    );
  } catch {
    /* ignore quota */
  }
}

export function gifToMediaFavorite(gif: GifResult): MediaFavorite {
  const now = Date.now();
  return {
    id: stableId('gif', gif.id, gif.url),
    kind: 'gif',
    url: gif.url,
    thumbUrl: gif.thumbnailUrl || gif.previewUrl || gif.url,
    previewUrl: gif.previewUrl || gif.thumbnailUrl || gif.url,
    title: gif.title || 'GIF',
    savedAt: now,
  };
}

export function imageToMediaFavorite(img: ImageSearchResult): MediaFavorite {
  const now = Date.now();
  return {
    id: stableId('image', img.id, img.url),
    kind: 'image',
    url: img.url,
    thumbUrl: img.thumbUrl || img.url,
    title: img.alt || 'Image',
    savedAt: now,
  };
}

export function useMediaFavorites() {
  const items = ref<MediaFavorite[]>(load());

  const gifFavorites = computed(() =>
    items.value.filter((f) => f.kind === 'gif'),
  );
  const imageFavorites = computed(() =>
    items.value.filter((f) => f.kind === 'image'),
  );

  function isFavorite(id: string): boolean {
    return items.value.some((f) => f.id === id);
  }

  function addFavorite(entry: MediaFavorite) {
    const without = items.value.filter((f) => f.id !== entry.id);
    const next = [{ ...entry, savedAt: Date.now() }, ...without].slice(
      0,
      MAX_FAVORITES,
    );
    items.value = next;
    save(next);
  }

  function removeFavorite(id: string) {
    const next = items.value.filter((f) => f.id !== id);
    if (next.length === items.value.length) return;
    items.value = next;
    save(next);
  }

  function toggleFavorite(entry: MediaFavorite) {
    if (isFavorite(entry.id)) removeFavorite(entry.id);
    else addFavorite(entry);
  }

  return {
    items,
    gifFavorites,
    imageFavorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
