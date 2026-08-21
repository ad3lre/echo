import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildSerperImageCacheKey,
  isCacheFresh,
  mergeImageResults,
  normalizeImageSearchQuery,
  refreshBackoffMs,
  shouldAttemptRefresh,
  type ImageSearchResultRow,
} from '../../services/search/serperImageSearchCache';
import {
  reserveUserImageSearchCredit,
  refundUserImageSearchCredit,
  __resetSerperUserSearchQuotaForTests,
} from '../../services/search/serperUserSearchQuota';
import { __resetSerperGlobalUsageBudgetForTests } from '../../services/search/serperGlobalUsageBudget';

function row(url: string): ImageSearchResultRow {
  return { id: url, url, thumbUrl: url, alt: 'x' };
}

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.NODE_ENV = 'test';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  delete process.env.REDIS_URL;
  process.env.DATABASE_URL = '';
  process.env.USE_MOCK_DB = 'true';
  __resetSerperUserSearchQuotaForTests();
  __resetSerperGlobalUsageBudgetForTests();

  const merged = mergeImageResults(
    [row('https://a/new'), row('https://b/new')],
    [row('https://b/old'), row('https://c/old')],
    10,
  );
  assert.equal(merged.length, 4);
  assert.equal(merged[0]?.url, 'https://a/new');
  assert.equal(merged[1]?.url, 'https://b/new');
  assert.equal(merged[2]?.url, 'https://b/old');
  assert.equal(merged[3]?.url, 'https://c/old');

  const q = normalizeImageSearchQuery('  Cat  ');
  assert.equal(q, 'cat');
  const k1 = buildSerperImageCacheKey('cat', 20, 1);
  const k2 = buildSerperImageCacheKey('cat', 20, 2);
  assert.notEqual(k1, k2);

  const now = Date.parse('2026-06-01T12:00:00Z');
  const freshAt = new Date(now - 30 * 86_400_000);
  assert.equal(isCacheFresh(freshAt, now, 90), true);
  const staleAt = new Date(now - 91 * 86_400_000);
  assert.equal(isCacheFresh(staleAt, now, 90), false);

  assert.equal(refreshBackoffMs(1), 24 * 60 * 60 * 1000);
  assert.equal(refreshBackoffMs(4), 30 * 86_400_000);

  const staleRow = {
    refreshedAt: staleAt,
    lastFailedAt: new Date(now - 1 * 60 * 60 * 1000),
    failureCount: 1,
  };
  assert.equal(shouldAttemptRefresh(staleRow, now, 90), false);
  assert.equal(
    shouldAttemptRefresh(
      { refreshedAt: staleAt, lastFailedAt: null, failureCount: 0 },
      now,
      90,
    ),
    true,
  );

  assert.equal(
    shouldAttemptRefresh(
      {
        refreshedAt: staleAt,
        lastFailedAt: new Date(now - 30 * 86_400_000),
        failureCount: 3,
      },
      now,
      90,
      3,
    ),
    false,
  );

  const userId = `quota-test-${Date.now()}`;
  for (let i = 0; i < 10; i++) {
    const r = await reserveUserImageSearchCredit(userId, `q-${i}`, 10);
    assert.equal(r.ok, true, `search ${i}`);
  }
  const blocked = await reserveUserImageSearchCredit(userId, 'extra-query', 10);
  assert.equal(blocked.ok, false);

  const again = await reserveUserImageSearchCredit(userId, 'q-0', 10);
  assert.equal(again.ok, true);
  assert.equal(again.alreadyCounted, true);

  const refundUser = `quota-refund-${Date.now()}`;
  const first = await reserveUserImageSearchCredit(refundUser, 'only-q', 1);
  assert.equal(first.ok, true);
  const second = await reserveUserImageSearchCredit(refundUser, 'only-q', 1);
  assert.equal(second.alreadyCounted, true);
  await refundUserImageSearchCredit(refundUser, 'only-q');
  const third = await reserveUserImageSearchCredit(refundUser, 'only-q', 1);
  assert.equal(third.ok, true);

  process.env.SERPER_GLOBAL_MAX_PER_DAY = '2';
  process.env.SERPER_GLOBAL_MAX_PER_MONTH = '0';
  for (const k of Object.keys(require.cache)) {
    if (
      k.includes('serperGlobalUsageBudget') ||
      k.endsWith(`${path.sep}config.js`) ||
      k.includes(`${path.sep}config.ts`)
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
  const {
    tryReserveGlobalSerperUnit,
    refundGlobalSerperUnit,
    __resetSerperGlobalUsageBudgetForTests: resetGlobal,
  } = await import('../../services/search/serperGlobalUsageBudget');
  const { config: cfg } = await import('../../config');
  assert.equal(cfg.serperGlobalMaxPerDay, 2);
  resetGlobal();
  const g1 = await tryReserveGlobalSerperUnit();
  const g2 = await tryReserveGlobalSerperUnit();
  const g3 = await tryReserveGlobalSerperUnit();
  assert.equal(g1.ok, true);
  assert.equal(g2.ok, true);
  assert.equal(g3.ok, false);
  if (!g3.ok) assert.equal(g3.reason, 'day');
  await refundGlobalSerperUnit();
  const g4 = await tryReserveGlobalSerperUnit();
  assert.equal(g4.ok, true);
  delete process.env.SERPER_GLOBAL_MAX_PER_DAY;
  delete process.env.SERPER_GLOBAL_MAX_PER_MONTH;

  console.log('serperImageSearchCache.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
