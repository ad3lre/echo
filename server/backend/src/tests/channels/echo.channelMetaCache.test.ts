import assert from 'node:assert/strict';
import {
  getCachedChannelMeta,
  setCachedChannelMeta,
  invalidateChannelMeta,
  invalidateChannelMetaForServer,
  getEchoChannelMetaGeneration,
  resetEchoChannelMetaCacheForTests,
  type EchoChannelMeta,
} from '../../domain/echoChannelMetaCache';
import {
  registerCacheInvalidationHandler,
  dispatchCacheInvalidationLocalForTests,
  resetCacheInvalidationBusForTests,
} from '../../domain/cacheInvalidationBus';
import { getEchoChannelMeta } from '../../domain/echoStore/channels/channelMeta';

type FakePool = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
};

function poolReturning(
  rows: unknown[],
  onQuery?: () => void,
): import('pg').Pool {
  const fake: FakePool = {
    query: async () => {
      onQuery?.();
      return { rows };
    },
  };
  return fake as unknown as import('pg').Pool;
}

async function runLoader(): Promise<void> {
  // Miss → DB read → populate; second call is a hit with no further query.
  resetEchoChannelMetaCacheForTests();
  let queries = 0;
  const row = {
    server_id: 's1',
    type: 'text',
    category_id: 'cat1',
    parent_channel_id: null,
    slowmode_seconds: 5,
    message_format_template: '[x]',
    message_format_hard: true,
  };
  const pool = poolReturning([row], () => {
    queries += 1;
  });
  const first = await getEchoChannelMeta(pool, 'c1');
  assert.equal(queries, 1, 'cold read hits DB once');
  assert.deepEqual(first, {
    serverId: 's1',
    type: 'text',
    categoryId: 'cat1',
    parentChannelId: null,
    slowmodeSeconds: 5,
    messageFormatTemplate: '[x]',
    messageFormatHard: true,
  });
  const second = await getEchoChannelMeta(pool, 'c1');
  assert.equal(queries, 1, 'warm read served from cache, no DB');
  assert.deepEqual(second, first);

  // No row → null, not cached.
  resetEchoChannelMetaCacheForTests();
  const none = await getEchoChannelMeta(poolReturning([]), 'gone');
  assert.equal(none, null);
  assert.equal(getCachedChannelMeta('gone'), null);

  // Generation race: an invalidation during the in-flight fill must prevent caching.
  resetEchoChannelMetaCacheForTests();
  const racingPool: import('pg').Pool = {
    query: async () => {
      invalidateChannelMetaForServer('s1'); // bump generation mid-fill
      return { rows: [row] };
    },
  } as unknown as import('pg').Pool;
  const raced = await getEchoChannelMeta(racingPool, 'c2');
  assert.ok(raced, 'still returns freshly-read value to the caller');
  assert.equal(
    getCachedChannelMeta('c2'),
    null,
    'racing invalidation prevents stale caching',
  );
}

function meta(serverId: string | null): EchoChannelMeta {
  return {
    serverId,
    type: 'text',
    categoryId: null,
    parentChannelId: null,
    slowmodeSeconds: 0,
    messageFormatTemplate: '',
    messageFormatHard: false,
  };
}

function run() {
  resetEchoChannelMetaCacheForTests();

  // Round-trips store and read back.
  setCachedChannelMeta('c1', meta('s1'));
  assert.equal(getCachedChannelMeta('c1')?.serverId, 's1');
  assert.equal(getCachedChannelMeta('missing'), null);

  // Single invalidation drops only that channel and bumps the generation.
  setCachedChannelMeta('c2', meta('s1'));
  const g0 = getEchoChannelMetaGeneration();
  invalidateChannelMeta('c1');
  assert.equal(getCachedChannelMeta('c1'), null, 'c1 dropped');
  assert.equal(getCachedChannelMeta('c2')?.serverId, 's1', 'c2 retained');
  assert.ok(getEchoChannelMetaGeneration() > g0, 'generation bumped');

  // Server sweep drops every channel of that server, leaving others.
  setCachedChannelMeta('c1', meta('s1'));
  setCachedChannelMeta('c3', meta('s2'));
  invalidateChannelMetaForServer('s1');
  assert.equal(getCachedChannelMeta('c1'), null, 's1 channel swept');
  assert.equal(getCachedChannelMeta('c2'), null, 's1 channel swept');
  assert.equal(getCachedChannelMeta('c3')?.serverId, 's2', 's2 retained');

  // Generation-bracketing contract: a generation captured before an invalidation
  // differs after, so a racing fill must NOT store.
  const before = getEchoChannelMetaGeneration();
  invalidateChannelMetaForServer('s2');
  assert.notEqual(getEchoChannelMetaGeneration(), before);

  // Multi-handler bus: registering a second handler for a kind must APPEND, not clobber,
  // so channel-meta's channel:delete handler coexists with the channel→server cache's.
  let handlerA = 0;
  let handlerB = 0;
  registerCacheInvalidationHandler('test:multi', () => {
    handlerA += 1;
  });
  registerCacheInvalidationHandler('test:multi', () => {
    handlerB += 1;
  });
  dispatchCacheInvalidationLocalForTests({ kind: 'test:multi' });
  assert.equal(handlerA, 1, 'first handler invoked');
  assert.equal(handlerB, 1, 'second handler invoked (not clobbered)');

  // The remote channel:delete event drops cached channel meta.
  resetEchoChannelMetaCacheForTests();
  setCachedChannelMeta('c9', meta('s9'));
  dispatchCacheInvalidationLocalForTests({
    kind: 'channel:delete',
    channelId: 'c9',
  });
  assert.equal(
    getCachedChannelMeta('c9'),
    null,
    'channel:delete drops cached meta',
  );

  console.log('echo.channelMetaCache.test: cache ok');
  resetCacheInvalidationBusForTests();
}

run();
void runLoader().then(() => {
  console.log('echo.channelMetaCache.test: loader ok');
});
