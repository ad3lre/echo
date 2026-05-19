/**
 * Web image search via Google Programmable Search (Custom Search JSON API, image mode).
 * Credentials stay server-side: GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX.
 */

import { ref, onUnmounted } from 'vue';
import { apiGet } from '@/api/client';

export interface ImageSearchResult {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
}

/** Align loosely with server-side image search cache to cut duplicate /image-search calls. */
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<
  string,
  { data: ImageSearchResult[]; ts: number }
>();

function getCachedSearch(q: string): ImageSearchResult[] | null {
  const key = q.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (!entry || Date.now() - entry.ts > SEARCH_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedSearch(q: string, data: ImageSearchResult[]) {
  const key = q.toLowerCase().trim();
  searchCache.set(key, { data, ts: Date.now() });
}

function imageSearchUrl(q: string): string {
  const t = q.trim();
  if (!t) return '/api/v1/image-search';
  return `/api/v1/image-search?q=${encodeURIComponent(t)}`;
}

export function useImageSearch() {
  const query = ref('');
  const images = ref<ImageSearchResult[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let abortController: AbortController | null = null;

  onUnmounted(() => {
    abortController?.abort();
  });

  async function fetchCurated() {
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    loading.value = true;
    error.value = null;
    try {
      const data =
        (await apiGet<ImageSearchResult[]>(imageSearchUrl(''), { signal })) ??
        [];
      if (!signal.aborted) {
        images.value = data;
        setCachedSearch('', data);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to load images';
      error.value = msg.includes('503')
        ? 'Image search not configured on server'
        : msg;
      if (!signal.aborted) images.value = [];
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }

  async function search(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      const cached = getCachedSearch('');
      if (cached?.length) {
        images.value = cached;
        return;
      }
      await fetchCurated();
      if (images.value.length) setCachedSearch('', images.value);
      return;
    }
    const cached = getCachedSearch(trimmed);
    if (cached?.length) {
      images.value = cached;
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    loading.value = true;
    error.value = null;
    try {
      const data =
        (await apiGet<ImageSearchResult[]>(imageSearchUrl(trimmed), {
          signal,
        })) ?? [];
      if (!signal.aborted) {
        images.value = data;
        setCachedSearch(trimmed, data);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to search images';
      error.value = msg.includes('503')
        ? 'Image search not configured on server'
        : msg;
      if (!signal.aborted) images.value = [];
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }

  return {
    query,
    images,
    loading,
    error,
    fetchCurated,
    search,
  };
}
