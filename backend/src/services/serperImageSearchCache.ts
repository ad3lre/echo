import { createHash } from 'crypto';
import type pg from 'pg';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { ensureAppSchema } from '../db/ensureAppSchema';

export type ImageSearchResultRow = {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
};

export type SerperImageCacheRow = {
  cacheKey: string;
  queryText: string;
  imageNum: number;
  page: number;
  results: ImageSearchResultRow[];
  refreshedAt: Date;
  createdAt: Date;
  lastFailedAt: Date | null;
  failureCount: number;
};

const MS_PER_DAY = 86_400_000;

type MemRow = SerperImageCacheRow;

const memL2 = new Map<string, MemRow>();
let memL2Logged = false;

export function normalizeImageSearchQuery(
  raw: string,
  defaultQuery: string = config.serperDefaultQuery,
): string {
  const t = raw.trim();
  return (t || defaultQuery).trim().toLowerCase().slice(0, 240);
}

export function imageSearchQueryHash(normalizedQuery: string): string {
  return createHash('sha256').update(normalizedQuery).digest('hex').slice(0, 32);
}

export function buildSerperImageCacheKey(
  normalizedQuery: string,
  imageNum: number,
  page: number,
): string {
  const h = createHash('sha256')
    .update(`${imageNum}:${page}:${normalizedQuery}`)
    .digest('hex')
    .slice(0, 40);
  return `n${imageNum}:p${page}:${h}`;
}

export function resultIdFromUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 20);
}

export function mapSerperItem(item: {
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  link?: string;
  source?: string;
}): ImageSearchResultRow | null {
  const url =
    (typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '') ||
    (typeof item.link === 'string' ? item.link.trim() : '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  const thumb =
    (typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl.trim() : '') ||
    url;
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const alt =
    title ||
    (typeof item.source === 'string' ? item.source.trim() : '') ||
    'Image';
  return {
    id: resultIdFromUrl(url),
    url,
    thumbUrl: thumb,
    alt,
  };
}

export function mapSerperItems(
  items: {
    title?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    link?: string;
    source?: string;
  }[],
): ImageSearchResultRow[] {
  const seen = new Set<string>();
  const out: ImageSearchResultRow[] = [];
  for (const item of items) {
    const row = mapSerperItem(item);
    if (!row || seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row);
  }
  return out;
}

export function mergeImageResults(
  fresh: ImageSearchResultRow[],
  existing: ImageSearchResultRow[],
  maxTotal: number = config.serperCacheMaxResults,
): ImageSearchResultRow[] {
  const cap = Math.max(1, maxTotal);
  const seen = new Set<string>();
  const merged: ImageSearchResultRow[] = [];
  for (const row of fresh) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    merged.push(row);
    if (merged.length >= cap) return merged;
  }
  for (const row of existing) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    merged.push(row);
    if (merged.length >= cap) return merged;
  }
  return merged;
}

export function isCacheFresh(
  refreshedAt: Date,
  nowMs: number = Date.now(),
  refreshDays: number = config.serperCacheRefreshDays,
): boolean {
  const ageMs = nowMs - refreshedAt.getTime();
  return ageMs < refreshDays * MS_PER_DAY;
}

/** Hours to wait after last_failed_at before another refresh attempt. */
export function refreshBackoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0;
  if (failureCount === 1) return 24 * 60 * 60 * 1000;
  if (failureCount === 2) return 72 * 60 * 60 * 1000;
  if (failureCount === 3) return 7 * MS_PER_DAY;
  return 30 * MS_PER_DAY;
}

export function shouldAttemptRefresh(
  row: Pick<SerperImageCacheRow, 'refreshedAt' | 'lastFailedAt' | 'failureCount'>,
  nowMs: number = Date.now(),
  refreshDays: number = config.serperCacheRefreshDays,
  maxFailureCount: number = config.serperRefreshFailureMaxCount,
): boolean {
  if (isCacheFresh(row.refreshedAt, nowMs, refreshDays)) return false;
  if (maxFailureCount > 0 && row.failureCount >= maxFailureCount) return false;
  if (row.failureCount <= 0) return true;
  if (!row.lastFailedAt) return true;
  const wait = refreshBackoffMs(row.failureCount);
  return nowMs - row.lastFailedAt.getTime() >= wait;
}

/** In-process L2 only — for tests when DATABASE_URL is unset. */
export function __resetSerperImageCacheMemForTests(): void {
  memL2.clear();
  memL2Logged = false;
}

export function __seedSerperImageCacheMemForTests(
  row: SerperImageCacheRow,
): void {
  memL2.set(row.cacheKey, row);
}

function parseResultsJson(raw: unknown): ImageSearchResultRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ImageSearchResultRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url : '';
    if (!url.startsWith('http')) continue;
    out.push({
      id:
        typeof o.id === 'string'
          ? o.id
          : resultIdFromUrl(url),
      url,
      thumbUrl: typeof o.thumbUrl === 'string' ? o.thumbUrl : url,
      alt: typeof o.alt === 'string' ? o.alt : 'Image',
    });
  }
  return out;
}

function rowFromPg(r: Record<string, unknown>): SerperImageCacheRow {
  return {
    cacheKey: String(r.cache_key),
    queryText: String(r.query_text),
    imageNum: Number(r.image_num),
    page: Number(r.page),
    results: parseResultsJson(r.results),
    refreshedAt: new Date(String(r.refreshed_at)),
    createdAt: new Date(String(r.created_at)),
    lastFailedAt: r.last_failed_at
      ? new Date(String(r.last_failed_at))
      : null,
    failureCount: Number(r.failure_count ?? 0),
  };
}

export async function getSerperImageCacheRow(
  cacheKey: string,
): Promise<SerperImageCacheRow | null> {
  const pool = getPgPool();
  if (!pool) {
    if (!memL2Logged) {
      memL2Logged = true;
      console.warn(
        '[serper-image-cache] DATABASE_URL unset — using in-process L2 (not durable across restarts)',
      );
    }
    return memL2.get(cacheKey) ?? null;
  }
  await ensureAppSchema(pool);
  const r = await pool.query(
    `
    SELECT cache_key, query_text, image_num, page, results,
           refreshed_at, created_at, last_failed_at, failure_count
    FROM echo_serper_image_search_cache
    WHERE cache_key = $1
    LIMIT 1
    `,
    [cacheKey],
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowFromPg(row as Record<string, unknown>);
}

export async function upsertSerperImageCacheSuccess(
  cacheKey: string,
  queryText: string,
  imageNum: number,
  page: number,
  results: ImageSearchResultRow[],
): Promise<void> {
  const now = new Date();
  const pool = getPgPool();
  if (!pool) {
    memL2.set(cacheKey, {
      cacheKey,
      queryText,
      imageNum,
      page,
      results,
      refreshedAt: now,
      createdAt: memL2.get(cacheKey)?.createdAt ?? now,
      lastFailedAt: null,
      failureCount: 0,
    });
    return;
  }
  await ensureAppSchema(pool);
  await pool.query(
    `
    INSERT INTO echo_serper_image_search_cache (
      cache_key, query_text, image_num, page, results,
      refreshed_at, created_at, last_failed_at, failure_count
    ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW(), NULL, 0)
    ON CONFLICT (cache_key) DO UPDATE SET
      query_text = EXCLUDED.query_text,
      image_num = EXCLUDED.image_num,
      page = EXCLUDED.page,
      results = EXCLUDED.results,
      refreshed_at = NOW(),
      last_failed_at = NULL,
      failure_count = 0
    `,
    [cacheKey, queryText, imageNum, page, JSON.stringify(results)],
  );
}

export async function recordSerperImageCacheFailure(
  cacheKey: string,
  queryText: string,
  imageNum: number,
  page: number,
  existingResults: ImageSearchResultRow[],
): Promise<void> {
  const now = new Date();
  const pool = getPgPool();
  if (!pool) {
    const prev = memL2.get(cacheKey);
    memL2.set(cacheKey, {
      cacheKey,
      queryText,
      imageNum,
      page,
      results: prev?.results ?? existingResults,
      refreshedAt: prev?.refreshedAt ?? now,
      createdAt: prev?.createdAt ?? now,
      lastFailedAt: now,
      failureCount: (prev?.failureCount ?? 0) + 1,
    });
    return;
  }
  await ensureAppSchema(pool);
  await pool.query(
    `
    INSERT INTO echo_serper_image_search_cache (
      cache_key, query_text, image_num, page, results,
      refreshed_at, created_at, last_failed_at, failure_count
    ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW(), NOW(), 1)
    ON CONFLICT (cache_key) DO UPDATE SET
      last_failed_at = NOW(),
      failure_count = echo_serper_image_search_cache.failure_count + 1
    `,
    [cacheKey, queryText, imageNum, page, JSON.stringify(existingResults)],
  );
}
