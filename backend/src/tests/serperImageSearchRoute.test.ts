import assert from 'node:assert/strict';
import path from 'node:path';
import Fastify from 'fastify';

const TEST_USER_ID = 'echo-test-isolation-user';

function clearModule(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require.resolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
}

function clearConfigAndRoute() {
  clearModule('../config');
  for (const k of Object.keys(require.cache)) {
    if (
      k.includes(`${path.sep}backend${path.sep}src${path.sep}config.`) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes${path.sep}serperImageSearch.`,
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function registerRoute(
  fetchImpl: typeof globalThis.fetch,
): Promise<ReturnType<typeof Fastify>> {
  clearConfigAndRoute();
  globalThis.fetch = fetchImpl;
  const { default: serperImageSearchRoutes } =
    await import('../api/routes/serperImageSearch');
  const app = Fastify({ logger: false });
  await app.register(serperImageSearchRoutes, { prefix: '/api/v1' });
  return app;
}

async function run(): Promise<void> {
  const originalFetch = globalThis.fetch;
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.NODE_ENV = 'test';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.DATABASE_URL = '';
  delete process.env.REDIS_URL;
  process.env.USE_MOCK_DB = 'true';
  process.env.SERPER_API_KEY = 'route-test-key';
  process.env.SERPER_IMAGE_NUM = '20';
  process.env.SERPER_REFRESH_FAILURE_MAX_COUNT = '3';
  clearConfigAndRoute();

  const {
    buildSerperImageCacheKey,
    normalizeImageSearchQuery,
    __resetSerperImageCacheMemForTests,
    __seedSerperImageCacheMemForTests,
  } = await import('../services/serperImageSearchCache');
  const { reserveUserImageSearchCredit, __resetSerperUserSearchQuotaForTests } =
    await import('../services/serperUserSearchQuota');
  const { __resetSerperGlobalUsageBudgetForTests } =
    await import('../services/serperGlobalUsageBudget');

  __resetSerperImageCacheMemForTests();
  __resetSerperUserSearchQuotaForTests();
  __resetSerperGlobalUsageBudgetForTests();

  function row(url: string) {
    return { id: url, url, thumbUrl: url, alt: 'test' };
  }

  try {
    let fetchCalls = 0;
    const staleApp = await registerRoute(async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          images: [
            {
              title: 'fresh',
              imageUrl: 'https://example.com/fresh.jpg',
              thumbnailUrl: 'https://example.com/fresh-t.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const staleQuery = 'stale-cache-query';
    const normalized = normalizeImageSearchQuery(staleQuery);
    const cacheKey = buildSerperImageCacheKey(normalized, 20, 1);
    const staleRefreshed = new Date(Date.now() - 100 * 86_400_000);
    __seedSerperImageCacheMemForTests({
      cacheKey,
      queryText: staleQuery,
      imageNum: 20,
      page: 1,
      results: [row('https://example.com/stale.jpg')],
      refreshedAt: staleRefreshed,
      createdAt: staleRefreshed,
      lastFailedAt: null,
      failureCount: 0,
    });
    const staleRes = await staleApp.inject({
      method: 'GET',
      url: `/api/v1/image-search?q=${encodeURIComponent(staleQuery)}`,
    });
    assert.equal(staleRes.statusCode, 200);
    assert.equal(staleRes.headers['x-echo-image-search-cache'], 'STALE');
    const staleBody = JSON.parse(staleRes.body) as {
      results: { url: string }[];
    };
    assert.equal(staleBody.results[0]?.url, 'https://example.com/stale.jpg');
    await staleApp.close();

    __resetSerperImageCacheMemForTests();
    const blockedKey = buildSerperImageCacheKey(
      normalizeImageSearchQuery('blocked-refresh'),
      20,
      1,
    );
    const blockedAt = new Date(Date.now() - 100 * 86_400_000);
    __seedSerperImageCacheMemForTests({
      cacheKey: blockedKey,
      queryText: 'blocked-refresh',
      imageNum: 20,
      page: 1,
      results: [row('https://example.com/blocked.jpg')],
      refreshedAt: blockedAt,
      createdAt: blockedAt,
      lastFailedAt: blockedAt,
      failureCount: 3,
    });
    fetchCalls = 0;
    const noRefreshApp = await registerRoute(async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    });
    const noRefreshRes = await noRefreshApp.inject({
      method: 'GET',
      url: '/api/v1/image-search?q=blocked-refresh',
    });
    assert.equal(noRefreshRes.statusCode, 200);
    assert.equal(
      noRefreshRes.headers['x-echo-image-search-cache'],
      'STALE_NO_REFRESH',
    );
    assert.equal(fetchCalls, 0);
    await noRefreshApp.close();

    __resetSerperUserSearchQuotaForTests();
    for (let i = 0; i < 10; i++) {
      const r = await reserveUserImageSearchCredit(
        TEST_USER_ID,
        `pre-${i}`,
        10,
      );
      assert.equal(r.ok, true);
    }
    fetchCalls = 0;
    const limitApp = await registerRoute(async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    });
    const limitRes = await limitApp.inject({
      method: 'GET',
      url: '/api/v1/image-search?q=eleventh-distinct-query',
    });
    assert.equal(limitRes.statusCode, 429);
    const limitJson = JSON.parse(limitRes.body) as { code?: string };
    assert.equal(limitJson.code, 'PLAN_LIMIT');
    assert.equal(limitRes.headers['x-echo-image-search-daily-remaining'], '0');
    assert.equal(fetchCalls, 0);
    await limitApp.close();

    __resetSerperUserSearchQuotaForTests();
    fetchCalls = 0;
    const missApp = await registerRoute(async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          images: [
            {
              title: 'miss',
              imageUrl: 'https://example.com/miss.jpg',
              thumbnailUrl: 'https://example.com/miss-t.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const missRes = await missApp.inject({
      method: 'GET',
      url: '/api/v1/image-search?q=cold-miss-query',
    });
    assert.equal(missRes.statusCode, 200);
    assert.equal(missRes.headers['x-echo-image-search-cache'], 'MISS');
    assert.equal(missRes.headers['x-echo-image-search-daily-limit'], '10');
    assert.equal(missRes.headers['x-echo-image-search-daily-remaining'], '9');
    assert.equal(fetchCalls, 1);
    const missBody = JSON.parse(missRes.body) as { results: { url: string }[] };
    assert.equal(missBody.results[0]?.url, 'https://example.com/miss.jpg');
    await missApp.close();

    console.log('serperImageSearchRoute.test.ts: ok');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.SERPER_API_KEY = 'route-test-key';
    clearConfigAndRoute();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
