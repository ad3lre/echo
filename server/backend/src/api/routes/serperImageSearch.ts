/**
 * Image search via Serper.dev — L1/L2 cache, plan quotas, global caps, async stale refresh.
 */

import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginOptions,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { requireAuth } from '../../auth/middleware';
import type { AuthUser } from '../../auth/types';
import { config } from '../../config';
import { SERPER_FETCH_MS } from '../../constants/outboundHttp';
import { getEchoEntitlements } from '../../domain/echoPlanEntitlements';
import { getPgPool } from '../../db/pg';
import {
  buildSerperImageCacheKey,
  getSerperImageCacheRow,
  isCacheFresh,
  mapSerperItems,
  mergeImageResults,
  normalizeImageSearchQuery,
  imageSearchQueryHash,
  recordSerperImageCacheFailure,
  shouldAttemptRefresh,
  upsertSerperImageCacheSuccess,
  type ImageSearchResultRow,
} from '../../services/search/serperImageSearchCache';
import {
  refundGlobalSerperUnit,
  tryReserveGlobalSerperUnit,
} from '../../services/search/serperGlobalUsageBudget';
import {
  imageSearchDailyLimitForPlan,
  planLimitExceededMessage,
  readUserImageSearchUsage,
  refundUserImageSearchCredit,
  reserveUserImageSearchCredit,
} from '../../services/search/serperUserSearchQuota';
import { sendError } from '../errors';

const SERPER_IMAGES_ENDPOINT = 'https://google.serper.dev/images';

export type ImageSearchPagePayload = {
  results: ImageSearchResultRow[];
  page: number;
  pageSize: number;
  maxPage: number;
  hasMore: boolean;
};

type SerperImagesResponse = {
  images?: {
    title?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    link?: string;
    source?: string;
  }[];
  message?: string;
  statusCode?: number;
};

type SerperFetchOk = { ok: true; data: ImageSearchResultRow[] };
type SerperFetchFail = { ok: false; status: number; diag?: string };

/** L1 hot cache */
const l1Cache = new Map<
  string,
  { expiresAt: number; data: ImageSearchResultRow[] }
>();

const inFlightFetch = new Map<
  string,
  Promise<SerperFetchOk | SerperFetchFail>
>();
const inFlightRefresh = new Set<string>();

const TEST_ISOLATION_USER: AuthUser = {
  id: 'echo-test-isolation-user',
  username: 'test_isolation',
  emailVerified: true,
  phoneVerified: false,
  displayName: 'Test',
  pfp: '',
  status: 'online',
  createdAt: new Date(0).toISOString(),
  echoPlan: 'free',
};

async function requireAuthForImageSearch(
  req: Parameters<typeof requireAuth>[0],
  reply: Parameters<typeof requireAuth>[1],
): Promise<void> {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') {
    req.authUser = TEST_ISOLATION_USER;
    return;
  }
  return requireAuth(req, reply);
}

/** Per-IP cold upstream budget */
type UpstreamBudget = { day: string; used: number };
const upstreamBudgetByIp = new Map<string, UpstreamBudget>();

function utcDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function parsePageParam(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > config.serperImageMaxPage) {
    return null;
  }
  return Math.floor(n);
}

function buildPagePayload(
  data: ImageSearchResultRow[],
  page: number,
): ImageSearchPagePayload {
  const pageSize = config.serperImageNum;
  const maxPage = config.serperImageMaxPage;
  const hasMore = page < maxPage && data.length >= pageSize;
  return { results: data, page, pageSize, maxPage, hasMore };
}

function l1Get(key: string): ImageSearchResultRow[] | null {
  const e = l1Cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    l1Cache.delete(key);
    return null;
  }
  l1Cache.delete(key);
  l1Cache.set(key, e);
  return e.data;
}

function l1Set(key: string, data: ImageSearchResultRow[]): void {
  const ttl = config.serperCacheTtlMs;
  const max = config.serperCacheMaxEntries;
  while (l1Cache.size >= max && !l1Cache.has(key)) {
    const first = l1Cache.keys().next().value as string | undefined;
    if (first === undefined) break;
    l1Cache.delete(first);
  }
  l1Cache.set(key, { expiresAt: Date.now() + ttl, data });
}

function tryReserveIpBudget(ip: string, units: number): boolean {
  const dailyMax = config.serperUpstreamMaxPerDayPerIp;
  if (dailyMax <= 0) return true;
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

function refundIpBudget(ip: string, units: number): void {
  const dailyMax = config.serperUpstreamMaxPerDayPerIp;
  if (dailyMax <= 0 || units <= 0) return;
  const row = upstreamBudgetByIp.get(ip);
  if (!row) return;
  row.used = Math.max(0, row.used - units);
}

function serperErrorMessage(
  parsed: SerperImagesResponse | null,
  rawSnippet: string,
): string | undefined {
  const m = parsed?.message?.trim();
  if (m) return m;
  const t = rawSnippet.trim();
  if (t.startsWith('{')) return undefined;
  return t.slice(0, 300) || undefined;
}

async function callSerper(
  q: string,
  page: number,
  log: FastifyBaseLogger,
): Promise<SerperFetchOk | SerperFetchFail> {
  let res: Response;
  try {
    res = await fetch(SERPER_IMAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.serperApiKey,
      },
      body: JSON.stringify({
        q,
        num: config.serperImageNum,
        page,
      }),
      signal: AbortSignal.timeout(SERPER_FETCH_MS),
    });
  } catch (err) {
    log.warn({ err, q, page }, 'Serper images fetch threw');
    return { ok: false, status: 503, diag: 'network_or_timeout' };
  }

  const text = await res.text();
  let parsed: SerperImagesResponse | null = null;
  try {
    parsed = JSON.parse(text) as SerperImagesResponse;
  } catch {
    parsed = null;
  }
  const diag = serperErrorMessage(parsed, text);

  if (!res.ok) {
    log.warn(
      { httpStatus: res.status, q, page, serperMessage: diag },
      'Serper HTTP error',
    );
    return { ok: false, status: res.status, diag };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, status: 502, diag: 'invalid_json_body' };
  }
  if (parsed.message && !parsed.images?.length) {
    const code = parsed.statusCode;
    const outStatus =
      code === 429
        ? 429
        : typeof code === 'number' && code >= 400 && code < 600
          ? code
          : 400;
    return { ok: false, status: outStatus, diag };
  }
  return { ok: true, data: mapSerperItems(parsed.images ?? []) };
}

function clientMessageForUpstreamFailure(
  status: number,
  diag?: string,
): string {
  if (status === 429) {
    return 'Image search quota exceeded. Try again later or check Serper credit balance.';
  }
  if (status === 403 || status === 401) {
    return 'Serper rejected the API key. Set SERPER_API_KEY to a valid key from serper.dev.';
  }
  if (status === 503) {
    return 'Could not reach image search (network or timeout). Retry shortly.';
  }
  if (diag && /invalid|api key/i.test(diag)) {
    return 'Serper reports an invalid API key.';
  }
  return `Image search failed (upstream HTTP ${status}).`;
}

function setQuotaHeaders(
  reply: { header: (k: string, v: string | number) => void },
  limit: number,
  remaining: number,
): void {
  reply.header('X-Echo-Image-Search-Daily-Limit', limit);
  reply.header('X-Echo-Image-Search-Daily-Remaining', Math.max(0, remaining));
}

async function applyFreshQuotaHeaders(
  reply: { header: (k: string, v: string | number) => void },
  userId: string,
  dailyLimit: number,
): Promise<void> {
  const usage = await readUserImageSearchUsage(userId, dailyLimit);
  setQuotaHeaders(reply, usage.limit, usage.remaining);
}

async function scheduleStaleRefresh(
  cacheKey: string,
  queryText: string,
  imageNum: number,
  page: number,
  existing: ImageSearchResultRow[],
  log: FastifyBaseLogger,
): Promise<void> {
  if (inFlightRefresh.has(cacheKey)) return;
  inFlightRefresh.add(cacheKey);
  try {
    const global = await tryReserveGlobalSerperUnit();
    if (!global.ok) {
      log.warn(
        { cacheKey, reason: global.reason },
        'serper_refresh_skipped_global_cap',
      );
      return;
    }
    const fetched = await callSerper(queryText, page, log);
    if (!fetched.ok) {
      await refundGlobalSerperUnit();
      await recordSerperImageCacheFailure(
        cacheKey,
        queryText,
        imageNum,
        page,
        existing,
      );
      log.warn({ cacheKey, status: fetched.status }, 'serper_refresh_failed');
      return;
    }
    const merged = mergeImageResults(fetched.data, existing);
    await upsertSerperImageCacheSuccess(
      cacheKey,
      queryText,
      imageNum,
      page,
      merged,
    );
    l1Set(cacheKey, merged);
    log.info({ cacheKey }, 'serper_refresh_ok');
  } finally {
    inFlightRefresh.delete(cacheKey);
  }
}

async function coldFetchUpstream(
  cacheKey: string,
  queryText: string,
  normalizedQuery: string,
  imageNum: number,
  page: number,
  userId: string,
  payerIp: string,
  log: FastifyBaseLogger,
): Promise<SerperFetchOk | SerperFetchFail> {
  const pool = getPgPool();
  const ent = pool
    ? await getEchoEntitlements(pool, userId)
    : { plan: 'free' as const };
  const dailyLimit = imageSearchDailyLimitForPlan(ent.plan);
  const qHash = imageSearchQueryHash(normalizedQuery);

  const credit = await reserveUserImageSearchCredit(userId, qHash, dailyLimit);
  if (!credit.ok) {
    return {
      ok: false,
      status: 429,
      diag: `PLAN_LIMIT:${ent.plan}`,
    };
  }
  const creditConsumed = !credit.alreadyCounted;

  const global = await tryReserveGlobalSerperUnit();
  if (!global.ok) {
    if (creditConsumed) {
      await refundUserImageSearchCredit(userId, qHash);
    }
    return {
      ok: false,
      status: 429,
      diag: `GLOBAL_CAP:${global.reason}`,
    };
  }

  if (!tryReserveIpBudget(payerIp, 1)) {
    await refundGlobalSerperUnit();
    if (creditConsumed) {
      await refundUserImageSearchCredit(userId, qHash);
    }
    return { ok: false, status: 429, diag: 'IP_CAP' };
  }

  const fetched = await callSerper(queryText, page, log);
  if (!fetched.ok) {
    await refundGlobalSerperUnit();
    refundIpBudget(payerIp, 1);
    if (creditConsumed) {
      await refundUserImageSearchCredit(userId, qHash);
    }
    return fetched;
  }

  await upsertSerperImageCacheSuccess(
    cacheKey,
    queryText,
    imageNum,
    page,
    fetched.data,
  );
  l1Set(cacheKey, fetched.data);
  return fetched;
}

export default async function serperImageSearchRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: config.serperRateLimitPerMinute,
      timeWindow: '1 minute',
      keyGenerator: (req) => `serper-image:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Querystring: { q?: string; page?: string } }>(
      '/image-search',
      { preHandler: [requireAuthForImageSearch] },
      async (request, reply) => {
        if (!config.serperApiKey) {
          return sendError(
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'SERPER_API_KEY must be configured',
          );
        }

        const userId = request.authUser!.id;
        const page = parsePageParam(request.query.page);
        if (page === null) {
          return sendError(
            reply,
            400,
            'INVALID_QUERY',
            `page must be between 1 and ${config.serperImageMaxPage}`,
          );
        }

        const raw = request.query.q?.trim() ?? '';
        const normalizedQuery = normalizeImageSearchQuery(raw);
        const queryText = raw || config.serperDefaultQuery;
        const imageNum = config.serperImageNum;
        const cacheKey = buildSerperImageCacheKey(
          normalizedQuery,
          imageNum,
          page,
        );

        const pool = getPgPool();
        const ent = pool
          ? await getEchoEntitlements(pool, userId)
          : { plan: 'free' as const };
        const dailyLimit = imageSearchDailyLimitForPlan(ent.plan);

        const l1 = l1Get(cacheKey);
        if (l1) {
          reply.header('Cache-Control', 'private, max-age=120');
          reply.header('X-Echo-Image-Search-Cache', 'HIT');
          await applyFreshQuotaHeaders(reply, userId, dailyLimit);
          return reply.send(buildPagePayload(l1, page));
        }

        const l2 = await getSerperImageCacheRow(cacheKey);
        if (l2) {
          l1Set(cacheKey, l2.results);
          if (isCacheFresh(l2.refreshedAt)) {
            reply.header('Cache-Control', 'private, max-age=120');
            reply.header('X-Echo-Image-Search-Cache', 'HIT');
            await applyFreshQuotaHeaders(reply, userId, dailyLimit);
            return reply.send(buildPagePayload(l2.results, page));
          }

          reply.header('Cache-Control', 'private, max-age=120');
          if (shouldAttemptRefresh(l2)) {
            reply.header('X-Echo-Image-Search-Cache', 'STALE');
            void scheduleStaleRefresh(
              cacheKey,
              queryText,
              imageNum,
              page,
              l2.results,
              fastify.log,
            );
          } else {
            reply.header('X-Echo-Image-Search-Cache', 'STALE_NO_REFRESH');
          }
          await applyFreshQuotaHeaders(reply, userId, dailyLimit);
          return reply.send(buildPagePayload(l2.results, page));
        }

        let inflight = inFlightFetch.get(cacheKey);
        if (!inflight) {
          inflight = coldFetchUpstream(
            cacheKey,
            queryText,
            normalizedQuery,
            imageNum,
            page,
            userId,
            request.ip,
            fastify.log,
          ).finally(() => {
            inFlightFetch.delete(cacheKey);
          });
          inFlightFetch.set(cacheKey, inflight);
        }

        const fetched = await inflight;
        if (!fetched.ok) {
          const diag = fetched.diag ?? '';
          if (diag.startsWith('PLAN_LIMIT:')) {
            const plan = ent.plan;
            await applyFreshQuotaHeaders(reply, userId, dailyLimit);
            return sendError(
              reply,
              429,
              'PLAN_LIMIT',
              planLimitExceededMessage(plan),
            );
          }
          if (diag.startsWith('GLOBAL_CAP:')) {
            return sendError(
              reply,
              429,
              'RATE_LIMITED',
              'Image search is temporarily unavailable (instance daily limit). Try again tomorrow.',
            );
          }
          if (diag === 'IP_CAP') {
            return sendError(
              reply,
              429,
              'RATE_LIMITED',
              'Daily image search quota exceeded for this network. Try again tomorrow.',
            );
          }
          const httpStatus =
            fetched.status === 503
              ? 503
              : fetched.status === 429
                ? 429
                : fetched.status === 403 || fetched.status === 401
                  ? 403
                  : 502;
          return sendError(
            reply,
            httpStatus,
            'UPSTREAM_ERROR',
            clientMessageForUpstreamFailure(fetched.status, fetched.diag),
          );
        }

        reply.header('Cache-Control', 'private, max-age=120');
        reply.header('X-Echo-Image-Search-Cache', 'MISS');
        await applyFreshQuotaHeaders(reply, userId, dailyLimit);
        return reply.send(buildPagePayload(fetched.data, page));
      },
    );
  });
}
