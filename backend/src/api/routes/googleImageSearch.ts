/**
 * Google Programmable Search (Custom Search JSON API) — image search.
 * Closest supported option to Google Images; uses the same index via official API.
 *
 * Setup: https://developers.google.com/custom-search/v1/overview
 * Create a search engine at https://programmablesearchengine.google.com/ with
 * “Search the entire web” (or include sites you want). Image search is enabled in API via searchType=image.
 *
 * Env: GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX (engine id). Optional GOOGLE_CSE_DEFAULT_QUERY for empty browse.
 * Cost control: in-process result cache, per-IP rate limit, per-IP daily upstream call budget (see config).
 */

import { createHash } from 'crypto';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginOptions,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../../config';
import { GOOGLE_CSE_FETCH_MS } from '../../constants/outboundHttp';
import { sendError } from '../errors';

const CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

type CseImageBlock = {
  contextLink?: string;
  thumbnailLink?: string;
  thumbnailHeight?: number;
  thumbnailWidth?: number;
  height?: number;
  width?: number;
};

type CseItem = {
  title?: string;
  link?: string;
  displayLink?: string;
  image?: CseImageBlock;
};

type CseResponse = {
  items?: CseItem[];
  error?: { code?: number; message?: string; errors?: { message?: string }[] };
};

type ImageSearchResultRow = {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
};

type CsePageOk = { ok: true; items: CseItem[] };
type CsePageFail = { ok: false; status: number; diag?: string };

type FetchMappedOk = { ok: true; data: ImageSearchResultRow[] };
type FetchMappedFail = { ok: false; status: number; diag?: string };

function resultId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 20);
}

function mapItem(item: CseItem): ImageSearchResultRow | null {
  const url = typeof item.link === 'string' ? item.link.trim() : '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  const thumb =
    (typeof item.image?.thumbnailLink === 'string'
      ? item.image.thumbnailLink.trim()
      : '') || url;
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const alt =
    title ||
    (typeof item.displayLink === 'string' ? item.displayLink.trim() : '') ||
    'Image';
  return {
    id: resultId(url),
    url,
    thumbUrl: thumb,
    alt,
  };
}

function googleErrorMessage(
  parsed: CseResponse | null,
  rawSnippet: string,
): string | undefined {
  const m = parsed?.error?.message?.trim();
  if (m) return m;
  const e0 = parsed?.error?.errors?.[0]?.message?.trim();
  if (e0) return e0;
  const t = rawSnippet.trim();
  if (t.startsWith('{')) return undefined;
  return t.slice(0, 300) || undefined;
}

async function fetchCsePage(
  q: string,
  start: number,
  log: FastifyBaseLogger,
): Promise<CsePageOk | CsePageFail> {
  const params = new URLSearchParams({
    key: config.googleCseApiKey,
    cx: config.googleCseCx,
    q,
    searchType: 'image',
    safe: 'active',
    num: '10',
    start: String(start),
  });
  let res: Response;
  try {
    res = await fetch(`${CSE_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(GOOGLE_CSE_FETCH_MS),
    });
  } catch (err) {
    log.warn({ err, q, start }, 'Google CSE fetch threw (network/timeout)');
    return { ok: false, status: 503, diag: 'network_or_timeout' };
  }

  const text = await res.text();
  let parsed: CseResponse | null = null;
  try {
    parsed = JSON.parse(text) as CseResponse;
  } catch {
    parsed = null;
  }

  const diag = googleErrorMessage(parsed, text);

  if (!res.ok) {
    log.warn(
      {
        httpStatus: res.status,
        q,
        start,
        googleMessage: diag,
        bodySnippet: text.slice(0, 800),
      },
      'Google CSE HTTP error',
    );
    return { ok: false, status: res.status, diag };
  }

  if (!parsed || typeof parsed !== 'object') {
    log.warn(
      { bodySnippet: text.slice(0, 400) },
      'Google CSE: HTTP 200 but response was not a JSON object',
    );
    return { ok: false, status: 502, diag: 'invalid_json_body' };
  }

  if (parsed.error?.message || (parsed.error?.errors?.length ?? 0) > 0) {
    const code = parsed.error?.code;
    const outStatus =
      code === 429
        ? 429
        : typeof code === 'number' && code >= 400 && code < 600
          ? code
          : 400;
    log.warn(
      {
        googleCode: code,
        outStatus,
        q,
        start,
        googleMessage: diag,
      },
      'Google CSE error in JSON body',
    );
    return { ok: false, status: outStatus, diag };
  }

  return { ok: true, items: parsed.items ?? [] };
}

/** --- In-process LRU cache (normalized query → mapped results) --- */
const cseResultCache = new Map<
  string,
  { expiresAt: number; data: ImageSearchResultRow[] }
>();

function cacheKeyForQuery(resolvedQ: string, secondPage: boolean): string {
  const q = resolvedQ.trim().toLowerCase().slice(0, 240);
  return `${secondPage ? 'p2' : 'p1'}:${q}`;
}

function cacheGet(key: string): ImageSearchResultRow[] | null {
  const e = cseResultCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cseResultCache.delete(key);
    return null;
  }
  cseResultCache.delete(key);
  cseResultCache.set(key, e);
  return e.data;
}

function cacheSet(
  key: string,
  data: ImageSearchResultRow[],
  ttlMs: number,
  maxEntries: number,
): void {
  while (cseResultCache.size >= maxEntries && !cseResultCache.has(key)) {
    const first = cseResultCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    cseResultCache.delete(first);
  }
  cseResultCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

/** --- Per-IP daily budget for upstream CSE calls (UTC day) --- */
type UpstreamBudget = { day: string; used: number };

const upstreamBudgetByIp = new Map<string, UpstreamBudget>();

function utcDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function pruneStaleUpstreamBudgetRows(): void {
  if (upstreamBudgetByIp.size < 4000) return;
  const today = utcDayString();
  for (const [ip, row] of upstreamBudgetByIp) {
    if (row.day !== today) upstreamBudgetByIp.delete(ip);
  }
}

/**
 * Reserves `units` toward today's budget (1 per CSE page fetched). Returns false if over cap.
 */
function tryReserveUpstreamBudget(
  ip: string,
  units: number,
  dailyMax: number,
): boolean {
  if (dailyMax <= 0) return true;
  pruneStaleUpstreamBudgetRows();
  const day = utcDayString();
  let row = upstreamBudgetByIp.get(ip);
  if (!row || row.day !== day) {
    row = { day, used: 0 };
    upstreamBudgetByIp.set(ip, row);
  }
  if (row.used + units > dailyMax) return false;
  row.used += units;
  return true;
}

function refundUpstreamBudget(
  ip: string,
  units: number,
  dailyMax: number,
): void {
  if (dailyMax <= 0 || units <= 0) return;
  const row = upstreamBudgetByIp.get(ip);
  if (!row) return;
  row.used = Math.max(0, row.used - units);
}

/** One upstream fetch per cache key while in flight (same IP or not — saves duplicate Google calls). */
const inFlightByCacheKey = new Map<
  string,
  Promise<FetchMappedOk | FetchMappedFail>
>();

async function fetchFromGoogleAndMap(
  q: string,
  log: FastifyBaseLogger,
): Promise<FetchMappedOk | FetchMappedFail> {
  const first = await fetchCsePage(q, 1, log);

  if (!first.ok) {
    return { ok: false, status: first.status, diag: first.diag };
  }

  const merged: CseItem[] = [...first.items];
  if (config.googleCseImageSecondPage) {
    const second = await fetchCsePage(q, 11, log);
    if (second.ok && second.items.length > 0) {
      const seen = new Set(
        merged.map((i) => (typeof i.link === 'string' ? i.link : '')),
      );
      for (const it of second.items) {
        const L = typeof it.link === 'string' ? it.link : '';
        if (L && !seen.has(L)) {
          seen.add(L);
          merged.push(it);
        }
      }
    }
  }

  const data = merged
    .map(mapItem)
    .filter((x): x is ImageSearchResultRow => x !== null);
  return { ok: true, data };
}

function clientMessageForImageSearchFailure(
  status: number,
  diag?: string,
): string {
  const d = diag?.toLowerCase() ?? '';
  if (
    d.includes('does not have the access to custom search json api') ||
    d.includes('permission_denied')
  ) {
    return 'Google blocked Custom Search JSON API for this API key’s project. In Google Cloud: link a billing account to that project, enable “Custom Search API” (APIs & library), then wait a few minutes. Use a server API key without HTTP referrer restrictions.';
  }
  if (status === 429) {
    return 'Google image search quota exceeded for today. Try again tomorrow, or enable billing for Custom Search API in Google Cloud.';
  }
  if (status === 403 || status === 401) {
    return 'Google rejected image search (403). Link billing to the key’s project, enable “Custom Search API”, and use a server API key without “HTTP referrers” restriction.';
  }
  if (status === 400) {
    return 'Invalid image search configuration (400). Check GOOGLE_CSE_CX and that the Programmable Search Engine is set to search the entire web.';
  }
  if (status === 503) {
    return 'Could not reach Google image search (network or timeout). Retry shortly.';
  }
  if (diag && /API key not valid|invalid/i.test(diag)) {
    return 'Google reports an invalid API key. Set GOOGLE_CSE_API_KEY to a Google Cloud API key with Custom Search API enabled.';
  }
  return `Image search failed (upstream HTTP ${status}). Check API logs and Google Cloud Console (Custom Search API + Programmable Search Engine).`;
}

export default async function googleImageSearchRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: config.googleCseRateLimitPerMinute,
      timeWindow: '1 minute',
      keyGenerator: (req) => `google-cse-image:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Querystring: { q?: string } }>(
      '/image-search',
      async (request, reply) => {
        if (!config.googleCseApiKey || !config.googleCseCx) {
          return sendError(
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX must be configured',
          );
        }
        const raw = request.query.q?.trim() ?? '';
        const q = raw || config.googleCseDefaultQuery;
        const secondPage = config.googleCseImageSecondPage;
        const cKey = cacheKeyForQuery(q, secondPage);

        const cached = cacheGet(cKey);
        if (cached) {
          reply.header('Cache-Control', 'private, max-age=120');
          reply.header('X-Echo-Image-Search-Cache', 'HIT');
          return reply.send(cached);
        }

        const upstreamUnits = 1 + (secondPage ? 1 : 0);
        let inflight = inFlightByCacheKey.get(cKey);
        if (!inflight) {
          if (
            !tryReserveUpstreamBudget(
              request.ip,
              upstreamUnits,
              config.googleCseUpstreamMaxPerDayPerIp,
            )
          ) {
            return sendError(
              reply,
              429,
              'RATE_LIMITED',
              'Daily image search quota exceeded for this network. Try again tomorrow or use a more specific query.',
            );
          }
          const payerIp = request.ip;
          inflight = fetchFromGoogleAndMap(q, fastify.log)
            .then((fetched) => {
              if (!fetched.ok) {
                refundUpstreamBudget(
                  payerIp,
                  upstreamUnits,
                  config.googleCseUpstreamMaxPerDayPerIp,
                );
              }
              return fetched;
            })
            .finally(() => {
              inFlightByCacheKey.delete(cKey);
            });
          inFlightByCacheKey.set(cKey, inflight);
        }

        const fetched = await inflight;

        if (!fetched.ok) {
          const msg = clientMessageForImageSearchFailure(
            fetched.status,
            fetched.diag,
          );
          fastify.log.warn(
            { status: fetched.status, q, diag: fetched.diag },
            'Google CSE image failed (client message prepared)',
          );
          // Use 403 when Google denies API access so DevTools doesn’t look like a dead reverse-proxy.
          const httpStatus =
            fetched.status === 503
              ? 503
              : fetched.status === 429
                ? 429
                : fetched.status === 403 || fetched.status === 401
                  ? 403
                  : 502;
          return sendError(reply, httpStatus, 'UPSTREAM_ERROR', msg);
        }

        cacheSet(
          cKey,
          fetched.data,
          config.googleCseCacheTtlMs,
          config.googleCseCacheMaxEntries,
        );

        reply.header('Cache-Control', 'private, max-age=120');
        reply.header('X-Echo-Image-Search-Cache', 'MISS');
        return reply.send(fetched.data);
      },
    );
  });
}
