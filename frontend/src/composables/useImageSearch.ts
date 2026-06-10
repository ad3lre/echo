/**
 * Web image search via Serper.dev (proxied at GET /api/v1/image-search).
 * Credentials stay server-side: SERPER_API_KEY.
 */

import { ref, onUnmounted, type Ref } from 'vue';
import { API_BASE } from '@/config';
import { authTryCookieRefresh } from '@/api/authClient';
import { ApiError } from '@/api/client';
import { nativeAuthRequestHeaders } from '@/services/auth/nativeAuthToken';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  ensureImageBrowseCategories,
  imageCategoryBySlug,
  useImageBrowseCategories,
} from '@/composables/useImageBrowseCategories';

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

function applyImageSearchQuotaFromHeaders(res: Response) {
  const limitRaw = res.headers.get('X-Echo-Image-Search-Daily-Limit');
  const remainingRaw = res.headers.get('X-Echo-Image-Search-Daily-Remaining');
  if (limitRaw == null || remainingRaw == null) return;
  const limit = Number(limitRaw);
  const remaining = Number(remainingRaw);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return;
  useAuthSessionStore().patchImageSearchQuota({
    used: Math.max(0, limit - remaining),
    limit,
  });
}

async function parseErrorBody(
  res: Response,
): Promise<{ code: string; message: string } | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      'message' in parsed
    ) {
      return {
        code: String((parsed as { code: string }).code),
        message: String((parsed as { message: string }).message),
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

async function fetchImageSearchResponse(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  let headers = nativeAuthRequestHeaders();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      signal,
      credentials: 'include',
      headers: { ...headers },
    });
    if (res.status === 401 && attempt === 0) {
      const user = await authTryCookieRefresh();
      if (user) {
        useAuthSessionStore().applyRestoredProfile(user);
        headers = nativeAuthRequestHeaders();
        continue;
      }
    }
    return res;
  }
  throw new Error('Image search request failed');
}

async function fetchImageSearchPage(
  q: string,
  page: number,
  signal?: AbortSignal,
): Promise<ImageSearchPageResponse> {
  const res = await fetchImageSearchResponse(
    `${API_BASE}${imageSearchUrl(q, page)}`,
    signal,
  );
  applyImageSearchQuotaFromHeaders(res);
  if (!res.ok) {
    const body = await parseErrorBody(res);
    const message = body?.message ?? `${res.status} ${res.statusText}`;
    const code = body?.code ?? 'UNKNOWN';
    throw new ApiError(message, res.status, code);
  }
  return (await res.json()) as ImageSearchPageResponse;
}

let imageLibraryWarmInflight: Promise<void> | null = null;
let imageLibraryWarmKey = '';

/** Bumps when category warmup fills the in-memory cache (picker previews react to this). */
export const imageCategoryLibraryRevision: Ref<number> = ref(0);

function imageCategoryWarmKey(
  cats: readonly { slug: string; query: string }[],
): string {
  return cats.map((c) => `${c.slug}:${c.query}`).join('|');
}

/** Warm curated image category first pages for instant picker landing. */
export function warmImageCategoryLibrary(): Promise<void> {
  if (imageLibraryWarmInflight) return imageLibraryWarmInflight;
  imageLibraryWarmInflight = (async () => {
    await ensureImageBrowseCategories();
    const { categories } = useImageBrowseCategories();
    const warmKey = imageCategoryWarmKey(categories.value);
    if (warmKey === imageLibraryWarmKey) return;
    imageLibraryWarmKey = warmKey;
    const jobs = categories.value.map((cat) => {
      if (getCachedSearch(cat.query, 1)?.results.length)
        return Promise.resolve();
      return fetchImageSearchPage(cat.query, 1)
        .then((data) => setCachedSearch(cat.query, 1, data))
        .catch(() => {
          /* non-blocking */
        });
    });
    await Promise.all(jobs);
    imageCategoryLibraryRevision.value += 1;
  })().finally(() => {
    imageLibraryWarmInflight = null;
  });
  return imageLibraryWarmInflight;
}

export function getCachedImageCategoryResults(
  slug: string,
): ImageSearchResult[] | null {
  const cat = imageCategoryBySlug(slug);
  if (!cat) return null;
  return getCachedSearch(cat.query, 1)?.results ?? null;
}

export function getImageCategoryPreviewUrls(slug: string): string[] {
  const rows = getCachedImageCategoryResults(slug);
  if (!rows?.length) return [];
  return rows
    .slice(0, 2)
    .map((r) => r.thumbUrl || r.url)
    .filter(Boolean);
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
    const data = await fetchImageSearchPage(q, page, abortController?.signal);
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

  async function loadCategory(slug: string) {
    const cat = imageCategoryBySlug(slug);
    if (!cat) return;
    query.value = cat.query;
    const cached = getCachedSearch(cat.query, 1);
    if (cached?.results.length) {
      activeQueryKey = cat.query;
      applyPageResponse(cat.query, cached, false);
      return;
    }
    await search(cat.query);
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
    loadCategory,
  };
}
