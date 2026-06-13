import assert from 'node:assert/strict';
import type { AuthUser } from '../auth/types';
import {
  getEchoEventCachedUser,
  runWithEchoEventUserCache,
} from '../domain/echoEventUserCache';

function fakeUser(id: string): AuthUser {
  return { id, username: `u${id}` } as AuthUser;
}

async function run(): Promise<void> {
  // Within one event scope, repeated reads of the same id load once.
  await runWithEchoEventUserCache(async () => {
    let calls = 0;
    const load = (id: string) => () => {
      calls += 1;
      return Promise.resolve(fakeUser(id));
    };
    const a = await getEchoEventCachedUser('1', load('1'));
    const b = await getEchoEventCachedUser('1', load('1'));
    assert.equal(calls, 1, 'same id loads once per event');
    assert.equal(a, b, 'same object returned');

    // Concurrent reads of the same id also share one in-flight load.
    let concurrentCalls = 0;
    const slow = () => {
      concurrentCalls += 1;
      return new Promise<AuthUser | null>((resolve) =>
        setTimeout(() => resolve(fakeUser('2')), 5),
      );
    };
    const [c, d] = await Promise.all([
      getEchoEventCachedUser('2', slow),
      getEchoEventCachedUser('2', slow),
    ]);
    assert.equal(concurrentCalls, 1, 'concurrent same-id reads coalesce');
    assert.equal(c, d);

    // Different ids load independently.
    await getEchoEventCachedUser('3', load('3'));
    assert.equal(calls, 2, 'distinct id triggers its own load');
  });

  // Separate event scopes do not share cache.
  let scopeTwoCalls = 0;
  const loadOnce = () => {
    scopeTwoCalls += 1;
    return Promise.resolve(fakeUser('1'));
  };
  await runWithEchoEventUserCache(async () => {
    await getEchoEventCachedUser('1', loadOnce);
  });
  await runWithEchoEventUserCache(async () => {
    await getEchoEventCachedUser('1', loadOnce);
  });
  assert.equal(scopeTwoCalls, 2, 'each event scope loads fresh');

  // Outside any scope, the loader runs uncached (no throw).
  let unscopedCalls = 0;
  const unscoped = () => {
    unscopedCalls += 1;
    return Promise.resolve(fakeUser('9'));
  };
  await getEchoEventCachedUser('9', unscoped);
  await getEchoEventCachedUser('9', unscoped);
  assert.equal(unscopedCalls, 2, 'no scope means no caching');

  // A rejected load is evicted so a later read in the same event can retry.
  await runWithEchoEventUserCache(async () => {
    let attempt = 0;
    const flaky = () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(fakeUser('5'));
    };
    await assert.rejects(() => getEchoEventCachedUser('5', flaky));
    const recovered = await getEchoEventCachedUser('5', flaky);
    assert.equal(recovered?.id, '5', 'retry after rejection succeeds');
    assert.equal(attempt, 2);
  });

  console.log('echoEventUserCache.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
