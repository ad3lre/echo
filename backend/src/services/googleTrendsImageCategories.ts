/**
 * Monthly image browse categories sourced from Google Trends RSS (daily search trends).
 * Refreshed when the UTC month changes; falls back to curated defaults if fetch fails.
 */

import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config';
import { GOOGLE_TRENDS_FETCH_MS } from '../constants/outboundHttp';

export type ImageBrowseCategoryRow = {
  slug: string;
  name: string;
  query: string;
  navEmoji: string;
};

export type ImageBrowseCategoriesSnapshot = {
  monthKey: string;
  source: 'google_trends' | 'fallback';
  categories: ImageBrowseCategoryRow[];
  fetchedAt: number;
};

const CATEGORY_COUNT = 8;

const FALLBACK_CATEGORIES: readonly ImageBrowseCategoryRow[] = [
  { slug: 'nature', name: 'Nature', query: 'nature landscape', navEmoji: '🌿' },
  { slug: 'space', name: 'Space', query: 'space galaxy', navEmoji: '🌌' },
  { slug: 'food', name: 'Food', query: 'food photography', navEmoji: '🍕' },
  {
    slug: 'architecture',
    name: 'Architecture',
    query: 'architecture',
    navEmoji: '🏛️',
  },
  { slug: 'animals', name: 'Animals', query: 'cute animals', navEmoji: '🐾' },
  {
    slug: 'tech',
    name: 'Technology',
    query: 'technology workspace',
    navEmoji: '💻',
  },
  { slug: 'art', name: 'Art', query: 'digital art', navEmoji: '🎨' },
  {
    slug: 'travel',
    name: 'Travel',
    query: 'travel destination',
    navEmoji: '✈️',
  },
];

const CATEGORY_EMOJIS = [
  '🔥',
  '✨',
  '🌟',
  '💫',
  '🎯',
  '📸',
  '🌍',
  '🎬',
  '🏆',
  '💡',
  '🎵',
  '🚀',
] as const;

let cachedSnapshot: ImageBrowseCategoriesSnapshot | null = null;
let refreshInflight: Promise<ImageBrowseCategoriesSnapshot> | null = null;

export function currentUtcMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Exported for unit tests — strips markup/entities from RSS trend titles. */
export function sanitizeTrendSearchTerm(raw: string): string {
  let t = raw
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
  t = t.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[#*_`~|[\]()]/g, ' ');
  t = t.replace(/^['"]+|['"]+$/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function titleCaseTerm(term: string): string {
  return term
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function slugifyTerm(term: string): string {
  const slug = term
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'trend';
}

function emojiForTerm(term: string): string {
  let h = 0;
  for (let i = 0; i < term.length; i++) {
    h = (h * 31 + term.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_EMOJIS[h % CATEGORY_EMOJIS.length];
}

/** Exported for unit tests — parses Google Trends RSS `<item><title>` values. */
export function parseGoogleTrendsRssTitles(xml: string): string[] {
  const titles: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(
      /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i,
    );
    const title = titleMatch?.[1]?.trim();
    if (!title) continue;
    titles.push(title);
  }
  return titles;
}

export function buildCategoriesFromTrendTerms(
  terms: readonly string[],
): ImageBrowseCategoryRow[] {
  const seenSlugs = new Set<string>();
  const seenNormalized = new Set<string>();
  const out: ImageBrowseCategoryRow[] = [];
  for (const raw of terms) {
    const term = sanitizeTrendSearchTerm(raw);
    if (!term || term.length < 2) continue;
    const normalized = term.toLowerCase();
    if (seenNormalized.has(normalized)) continue;
    const slug = slugifyTerm(term);
    if (seenSlugs.has(slug)) continue;
    seenNormalized.add(normalized);
    seenSlugs.add(slug);
    out.push({
      slug,
      name: titleCaseTerm(term),
      query: term,
      navEmoji: emojiForTerm(term),
    });
    if (out.length >= CATEGORY_COUNT) break;
  }
  return out;
}

function fallbackSnapshot(monthKey: string): ImageBrowseCategoriesSnapshot {
  return {
    monthKey,
    source: 'fallback',
    categories: FALLBACK_CATEGORIES.map((c) => ({ ...c })),
    fetchedAt: Date.now(),
  };
}

async function fetchTrendingSearchTerms(
  log?: FastifyBaseLogger,
): Promise<string[]> {
  const geo = config.echoImageCategoriesTrendsGeo;
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(GOOGLE_TRENDS_FETCH_MS),
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': 'Echo/1.0 (+https://chat-echo.com)',
    },
  });
  if (!res.ok) {
    throw new Error(`Google Trends RSS ${res.status}`);
  }
  const xml = await res.text();
  const titles = parseGoogleTrendsRssTitles(xml);
  if (!titles.length) {
    throw new Error('Google Trends RSS returned no items');
  }
  log?.info(
    { geo, count: titles.length },
    'echo.image_categories.trends_fetched',
  );
  return titles;
}

async function buildSnapshotFromTrends(
  monthKey: string,
  log?: FastifyBaseLogger,
): Promise<ImageBrowseCategoriesSnapshot> {
  try {
    const terms = await fetchTrendingSearchTerms(log);
    const built = buildCategoriesFromTrendTerms(terms);
    if (built.length < 4) {
      throw new Error(`Too few trend categories (${built.length})`);
    }
    return {
      monthKey,
      source: 'google_trends',
      categories: built,
      fetchedAt: Date.now(),
    };
  } catch (e) {
    log?.warn({ err: e }, 'echo.image_categories.trends_fallback');
    return fallbackSnapshot(monthKey);
  }
}

export function getImageBrowseCategoriesSnapshot(): ImageBrowseCategoriesSnapshot | null {
  return cachedSnapshot;
}

export function getImageBrowseCategoriesForApi(): ImageBrowseCategoriesSnapshot {
  const monthKey = currentUtcMonthKey();
  if (cachedSnapshot?.monthKey === monthKey) return cachedSnapshot;
  return cachedSnapshot ?? fallbackSnapshot(monthKey);
}

/**
 * Refreshes when the UTC month changes or cache is empty. Concurrent callers share one fetch.
 */
export async function refreshImageBrowseCategoriesIfStale(
  log?: FastifyBaseLogger,
): Promise<ImageBrowseCategoriesSnapshot> {
  const monthKey = currentUtcMonthKey();
  if (cachedSnapshot?.monthKey === monthKey) return cachedSnapshot;

  if (refreshInflight) return refreshInflight;

  refreshInflight = (async () => {
    const next = await buildSnapshotFromTrends(monthKey, log);
    cachedSnapshot = next;
    return next;
  })().finally(() => {
    refreshInflight = null;
  });

  return refreshInflight;
}
