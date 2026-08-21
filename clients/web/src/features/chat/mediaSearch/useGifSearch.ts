/**
 * Giphy + Klipy GIF search/trending via backend proxy.
 * API keys stay server-side (GIPHY_API_KEY / KLIPY_API_KEY in backend .env).
 */

import { ref, onUnmounted, type Ref } from 'vue';
import { apiGet } from '@/api/client';
import {
  GIF_BROWSE_CATEGORIES,
  gifCategoryBySlug,
} from '@/features/chat/mediaSearch/mediaCategoryLibrary';

export interface GifResult {
  id: string;
  /** Full-size animated URL for send + message display (prefer GIF over WebP for import) */
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

function firstNonEmptyUrl(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Send/import URL — prefer real GIF bytes so rehost keeps `.gif` + animation semantics. */
function pickMessageGifUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return firstNonEmptyUrl(
    img.downsized?.url,
    img.fixed_height?.url,
    img.downsized_medium?.url,
    img.preview_gif?.url,
    img.downsized_small?.url,
    img.original?.url,
    img.downsized?.webp,
    img.fixed_height?.webp,
    img.original?.webp,
  );
}

/** Static still for grid—instant load */
function pickThumbnailUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return firstNonEmptyUrl(
    img.fixed_height_small_still?.url,
    img.fixed_height_still?.url,
    img.downsized_still?.url,
    img.fixed_height_small?.webp,
    img.fixed_height_small?.url,
  );
}

/** Animated preview for img (webp/gif)—use for hover in grid */
function pickPreviewUrl(gif: GiphyGif): string {
  const img = gif?.images;
  if (!img) return '';
  return firstNonEmptyUrl(
    img.preview_gif?.url,
    img.fixed_height_small?.webp,
    img.fixed_height_small?.url,
    img.downsized_small?.url,
    img.fixed_height?.url,
    pickMessageGifUrl(gif),
  );
}

function mapGif(g: GiphyGif): GifResult {
  const url = pickMessageGifUrl(g);
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

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { data: GifResult[]; ts: number }>();

function cacheKeyForQuery(q: string): string {
  return q.toLowerCase().trim();
}

function getCachedSearch(q: string): GifResult[] | null {
  const key = cacheKeyForQuery(q);
  const entry = searchCache.get(key);
  if (!entry || Date.now() - entry.ts > SEARCH_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedSearch(q: string, data: GifResult[]) {
  searchCache.set(cacheKeyForQuery(q), { data, ts: Date.now() });
}

async function fetchGifsFromApi(
  q: string,
  signal?: AbortSignal,
): Promise<GifResult[]> {
  const trimmed = q.trim();
  const path = trimmed
    ? `/api/v1/giphy/search?q=${encodeURIComponent(trimmed)}&limit=24`
    : '/api/v1/giphy/trending?limit=24';
  const data = (await apiGet<GiphyGif[]>(path, { signal })) ?? [];
  return data.map(mapGif);
}

/** Preload first N category preview stills for instant picker landing. */
const PREVIEW_PER_CATEGORY = 2;

/** Space Giphy proxy calls so picker warmup does not burst against the per-IP bucket. */
const GIF_LIBRARY_WARM_GAP_MS = 250;

let libraryWarmInflight: Promise<void> | null = null;

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bumps when category warmup fills the in-memory cache (picker previews react to this). */
export const gifCategoryLibraryRevision: Ref<number> = ref(0);

/** Test helper — clears in-memory GIF search cache. */
export function __clearGifSearchCacheForTests(): void {
  searchCache.clear();
  libraryWarmInflight = null;
  gifCategoryLibraryRevision.value = 0;
}

/**
 * Warm trending + category tag caches so the GIF picker landing feels instant.
 * Safe to call multiple times (idempotent while cache is fresh).
 */
export function warmGifCategoryLibrary(): Promise<void> {
  if (libraryWarmInflight) return libraryWarmInflight;
  libraryWarmInflight = (async () => {
    let warmedAny = false;
    for (const cat of GIF_BROWSE_CATEGORIES) {
      const q = cat.query;
      if (getCachedSearch(q)?.length) continue;
      if (warmedAny) await delayMs(GIF_LIBRARY_WARM_GAP_MS);
      try {
        const mapped = await fetchGifsFromApi(q);
        if (mapped.length) {
          setCachedSearch(q, mapped);
          warmedAny = true;
        }
      } catch {
        /* non-blocking warmup */
      }
    }
    if (warmedAny) gifCategoryLibraryRevision.value += 1;
  })().finally(() => {
    libraryWarmInflight = null;
  });
  return libraryWarmInflight;
}

/** First preview still URLs per category slug (after warmup). */
export function getGifCategoryPreviewUrls(slug: string): string[] {
  const cat = gifCategoryBySlug(slug);
  if (!cat) return [];
  const rows = getCachedSearch(cat.query);
  if (!rows?.length) return [];
  return rows
    .slice(0, PREVIEW_PER_CATEGORY)
    .map((g) => g.previewUrl || g.thumbnailUrl || g.url)
    .filter(Boolean);
}

export function getCachedGifCategoryResults(slug: string): GifResult[] | null {
  const cat = gifCategoryBySlug(slug);
  if (!cat) return null;
  return getCachedSearch(cat.query);
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
      const cached = getCachedSearch('');
      if (cached?.length) {
        if (!signal.aborted) gifs.value = cached;
        return;
      }
      const mapped = await fetchGifsFromApi('', signal);
      if (!signal.aborted) {
        gifs.value = mapped;
        if (mapped.length) setCachedSearch('', mapped);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to load GIFs';
      error.value = msg.includes('503')
        ? 'GIF search not configured on server'
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
      const mapped = await fetchGifsFromApi(trimmed, signal);
      if (!signal.aborted) {
        gifs.value = mapped;
        setCachedSearch(trimmed, mapped);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Failed to search GIFs';
      error.value = msg.includes('503')
        ? 'GIF search not configured on server'
        : msg;
      if (!signal.aborted) gifs.value = [];
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }

  async function loadCategory(slug: string) {
    const cat = gifCategoryBySlug(slug);
    if (!cat) return;
    query.value = cat.query;
    const cached = getCachedSearch(cat.query);
    if (cached?.length) {
      gifs.value = cached;
      return;
    }
    await search(cat.query);
  }

  return {
    query,
    gifs,
    loading,
    error,
    fetchTrending,
    search,
    loadCategory,
  };
}
