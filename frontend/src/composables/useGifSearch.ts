/**
 * Giphy GIF search and trending via backend proxy.
 * API key stays server-side (GIPHY_API_KEY in backend .env).
 */

import { ref, onUnmounted } from 'vue';
import { apiGet } from '@/api/client';

export interface GifResult {
  id: string;
  /** Full-size URL for message display (prefer WebP, smaller downsized) */
  url: string;
  /** Static still for grid thumbnail—instant load, no decode */
  thumbnailUrl: string;
  /** Animated preview for hover (webp or gif, img-compatible) */
  previewUrl: string;
  /** MP4 preview if available—use with <video> for lower CPU */
  previewMp4Url: string | null;
  title: string;
}

type GiphyGif = {
  id?: string;
  title?: string;
  images?: {
    downsized_medium?: { url?: string };
    downsized?: { url?: string; webp?: string };
    original?: { url?: string; webp?: string };
    fixed_height?: { url?: string; webp?: string };
    fixed_height_small?: { url?: string; webp?: string };
    fixed_height_small_still?: { url?: string };
    fixed_height_still?: { url?: string };
    downsized_still?: { url?: string };
    downsized_small?: { url?: string };
    preview?: { mp4?: string };
    preview_gif?: { url?: string };
  };
};

/** Full URL for message display—prefer WebP and smaller sizes */
function pickFullUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return (
    img.downsized?.webp ??
    img.downsized?.url ??
    img.fixed_height?.webp ??
    img.fixed_height?.url ??
    img.downsized_medium?.url ??
    img.original?.webp ??
    img.original?.url ??
    ''
  );
}

/** Static still for grid—instant load */
function pickThumbnailUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return (
    img.fixed_height_small_still?.url ??
    img.fixed_height_still?.url ??
    img.downsized_still?.url ??
    img.fixed_height_small?.webp ??
    img.fixed_height_small?.url ??
    ''
  );
}

/** Animated preview for img (webp/gif)—use for hover in grid */
function pickPreviewUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return (
    img.preview_gif?.url ??
    img.fixed_height_small?.webp ??
    img.fixed_height_small?.url ??
    img.downsized_small?.url ??
    img.fixed_height?.url ??
    pickFullUrl(gif)
  );
}

function mapGif(g: GiphyGif): GifResult {
  const url = pickFullUrl(g);
  const thumbnailUrl = pickThumbnailUrl(g);
  const previewUrl = pickPreviewUrl(g);
  const previewMp4Url = g?.images?.preview?.mp4 ?? null;
  return {
    id: (g?.id as string) ?? '',
    url: url || (g?.images?.original?.url ?? ''),
    thumbnailUrl: thumbnailUrl || previewUrl || url,
    previewUrl: previewUrl || thumbnailUrl || url,
    previewMp4Url: previewMp4Url || null,
    title: (g?.title as string) ?? '',
  };
}

const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min
const searchCache = new Map<string, { data: GifResult[]; ts: number }>();

function getCachedSearch(q: string): GifResult[] | null {
  const key = q.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (!entry || Date.now() - entry.ts > SEARCH_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedSearch(q: string, data: GifResult[]) {
  const key = q.toLowerCase().trim();
  searchCache.set(key, { data, ts: Date.now() });
}

export function useGifSearch() {
  const query = ref('');
  const gifs = ref<GifResult[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let abortController: AbortController | null = null;

  onUnmounted(() => {
    abortController?.abort();
  });

  async function fetchTrending() {
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    loading.value = true;
    error.value = null;
    try {
      const data =
        (await apiGet<GiphyGif[]>('/api/v1/giphy/trending', { signal })) ?? [];
      const mapped = data.map(mapGif);
      if (!signal.aborted) {
        gifs.value = mapped;
        setCachedSearch('', mapped);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to load GIFs';
      error.value = msg.includes('503')
        ? 'GIPHY not configured on server'
        : msg;
      if (!signal.aborted) gifs.value = [];
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }

  async function search(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      const cached = getCachedSearch('');
      if (cached?.length) {
        gifs.value = cached;
        return;
      }
      await fetchTrending();
      if (gifs.value.length) setCachedSearch('', gifs.value);
      return;
    }
    const cached = getCachedSearch(trimmed);
    if (cached?.length) {
      gifs.value = cached;
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    loading.value = true;
    error.value = null;
    try {
      const data =
        (await apiGet<GiphyGif[]>(
          `/api/v1/giphy/search?q=${encodeURIComponent(trimmed)}`,
          { signal },
        )) ?? [];
      const mapped = data.map(mapGif);
      if (!signal.aborted) {
        gifs.value = mapped;
        setCachedSearch(trimmed, mapped);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to search GIFs';
      error.value = msg.includes('503')
        ? 'GIPHY not configured on server'
        : msg;
      if (!signal.aborted) gifs.value = [];
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }

  return {
    query,
    gifs,
    loading,
    error,
    fetchTrending,
    search,
  };
}
