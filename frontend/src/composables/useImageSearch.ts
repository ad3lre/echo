/**
 * Web image search via Serper.dev (proxied at GET /api/v1/image-search).
 * Credentials stay server-side: SERPER_API_KEY.
 */

import { ref, onUnmounted } from 'vue';
import { ApiError, apiGet } from '@/api/client';

export interface ImageSearchResult {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
}

export interface ImageSearchPageResponse {
  results: ImageSearchResult[];
  page: number;
  pageSize: number;
  maxPage: number;
  hasMore: boolean;
}

/** Align loosely with server-side image search cache to cut duplicate /image-search calls. */
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<
  string,
  { data: ImageSearchPageResponse; ts: number }
>();

function cacheKey(q: string, page: number): string {
  return `${q.toLowerCase().trim()}|p${page}`;
}

function getCachedSearch(
  q: string,
  page: number,
): ImageSearchPageResponse | null {
  const entry = searchCache.get(cacheKey(q, page));
  if (!entry || Date.now() - entry.ts > SEARCH_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedSearch(
  q: string,
  page: number,
  data: ImageSearchPageResponse,
) {
  searchCache.set(cacheKey(q, page), { data, ts: Date.now() });
}

function formatImageSearchError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'PLAN_LIMIT') return e.message;
    if (e.statusCode === 503 && e.code === 'SERVICE_UNAVAILABLE') {
      return 'Image search not configured on server';
    }
    return e.message;
  }
  const msg = e instanceof Error ? e.message : 'Failed to search images';
  if (msg.includes('503')) {
    return 'Image search not configured on server';
  }
  return msg;
}

function imageSearchUrl(q: string, page: number): string {
  const t = q.trim();
  const base =
    t.length > 0
      ? `/api/v1/image-search?q=${encodeURIComponent(t)}`
      : '/api/v1/image-search';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}page=${page}`;
}

export function useImageSearch() {
  const query = ref('');
  const images = ref<ImageSearchResult[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const planLimitHit = ref(false);
  const hasMore = ref(false);
  const currentPage = ref(0);
  let abortController: AbortController | null = null;
  let activeQueryKey = '';

  onUnmounted(() => {
    abortController?.abort();
  });

  function applyPageResponse(
    qKey: string,
    payload: ImageSearchPageResponse,
    append: boolean,
  ) {
    if (qKey !== activeQueryKey) return;
    if (append) {
      const seen = new Set(images.value.map((i) => i.url));
      for (const row of payload.results) {
        if (!seen.has(row.url)) {
          seen.add(row.url);
          images.value.push(row);
        }
      }
    } else {
      images.value = payload.results;
    }
    currentPage.value = payload.page;
    hasMore.value = payload.hasMore;
  }

  async function fetchPage(q: string, page: number, append: boolean) {
    const cached = getCachedSearch(q, page);
    if (cached) {
      applyPageResponse(q, cached, append);
      return;
    }
    const data = await apiGet<ImageSearchPageResponse>(
      imageSearchUrl(q, page),
      {
        signal: abortController?.signal,
      },
    );
    if (!data) return;
    setCachedSearch(q, page, data);
    applyPageResponse(q, data, append);
  }

  async function fetchCurated() {
    abortController?.abort();
    abortController = new AbortController();
    const qKey = '';
    activeQueryKey = qKey;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    planLimitHit.value = false;
    currentPage.value = 0;
    hasMore.value = false;
    try {
      await fetchPage(qKey, 1, false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      planLimitHit.value = e instanceof ApiError && e.code === 'PLAN_LIMIT';
      error.value = formatImageSearchError(e);
      if (activeQueryKey === qKey) images.value = [];
    } finally {
      if (activeQueryKey === qKey) loading.value = false;
    }
  }

  async function search(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      const cached = getCachedSearch('', 1);
      if (cached?.results.length) {
        activeQueryKey = '';
        applyPageResponse('', cached, false);
        return;
      }
      await fetchCurated();
      return;
    }
    const cached = getCachedSearch(trimmed, 1);
    if (cached?.results.length) {
      activeQueryKey = trimmed;
      applyPageResponse(trimmed, cached, false);
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    const qKey = trimmed;
    activeQueryKey = qKey;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    planLimitHit.value = false;
    currentPage.value = 0;
    hasMore.value = false;
    try {
      await fetchPage(qKey, 1, false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      planLimitHit.value = e instanceof ApiError && e.code === 'PLAN_LIMIT';
      error.value = formatImageSearchError(e);
      if (activeQueryKey === qKey) images.value = [];
    } finally {
      if (activeQueryKey === qKey) loading.value = false;
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value) return;
    const qKey = query.value.trim();
    const nextPage = currentPage.value + 1;
    loadingMore.value = true;
    error.value = null;
    planLimitHit.value = false;
    try {
      await fetchPage(qKey, nextPage, true);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      planLimitHit.value = e instanceof ApiError && e.code === 'PLAN_LIMIT';
      error.value = formatImageSearchError(e);
    } finally {
      loadingMore.value = false;
    }
  }

  return {
    query,
    images,
    loading,
    loadingMore,
    error,
    planLimitHit,
    hasMore,
    currentPage,
    fetchCurated,
    search,
    loadMore,
  };
}
