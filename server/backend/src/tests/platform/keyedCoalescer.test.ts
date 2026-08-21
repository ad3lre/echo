import assert from 'node:assert/strict';
import { createKeyedCoalescer } from '../../shared/keyedCoalescer';
import { getEchoServerPermissionAggregate } from '../../domain/echoStore/roles/serverPermissionAggregate';
import { resetEchoServerAggregateCacheForTests } from '../../domain/echoServerPermissionAggregateCache';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function genericCoalescer(): Promise<void> {
  const c = createKeyedCoalescer<number>();

  // Concurrent calls for the same key share one invocation.
  let calls = 0;
  const d = deferred<number>();
  const fn = () => {
    calls += 1;
    return d.promise;
  };
  const p1 = c.run('k', fn);
  const p2 = c.run('k', fn);
  assert.equal(calls, 1, 'one invocation for concurrent same-key calls');
  assert.equal(c.size, 1, 'one in-flight entry');
  d.resolve(42);
  assert.equal(await p1, 42);
  assert.equal(await p2, 42);
  assert.equal(c.size, 0, 'entry cleared after settle');

  // After settle, a new call re-invokes (not a result cache).
  const d2 = deferred<number>();
  let calls2 = 0;
  const pReinvoke = c.run('k', () => {
    calls2 += 1;
    return d2.promise;
  });
  assert.equal(calls2, 1, 're-invokes after previous settled');
  d2.resolve(1);
  await pReinvoke;
  assert.equal(c.size, 0, 'entry cleared after re-invoke settled');

  // Distinct keys do not collide.
  const a = deferred<number>();
  const b = deferred<number>();
  const pa = c.run('a', () => a.promise);
  const pb = c.run('b', () => b.promise);
  assert.equal(c.size, 2, 'two distinct in-flight keys');
  a.resolve(1);
  b.resolve(2);
  assert.equal(await pa, 1);
  assert.equal(await pb, 2);
  assert.equal(c.size, 0);

  // Rejection is shared and clears the entry (coalesces concurrent, not failures).
  const dr = deferred<number>();
  let cr = 0;
  const r1 = c.run('r', () => {
    cr += 1;
    return dr.promise;
  });
  const r2 = c.run('r', () => {
    cr += 1;
    return dr.promise;
  });
  assert.equal(cr, 1, 'one invocation for concurrent same-key calls (reject)');
  dr.reject(new Error('boom'));
  await assert.rejects(() => r1);
  await assert.rejects(() => r2);
  assert.equal(c.size, 0, 'failed entry cleared');
}

async function aggregateConcurrentLoad(): Promise<void> {
  resetEchoServerAggregateCacheForTests();
  let queries = 0;
  const gate = deferred<void>();
  const pool = {
    query: async (_sql: string, _params: unknown[]) => {
      queries += 1;
      await gate.promise; // hold all queries open until both callers are in-flight
      return { rows: [] };
    },
  } as unknown as import('pg').Pool;

  // Two concurrent cold loads for the same server must issue ONE aggregate load
  // (6 queries), not two (12).
  const p1 = getEchoServerPermissionAggregate(pool, 'S');
  const p2 = getEchoServerPermissionAggregate(pool, 'S');
  await Promise.resolve();
  gate.resolve();
  const [a1, a2] = await Promise.all([p1, p2]);
  assert.equal(queries, 6, 'one coalesced aggregate load (6 queries), not 12');
  assert.equal(a1, a2, 'both callers get the same aggregate object');

  // After settle + cache populated, a subsequent call hits cache (no query).
  const before = queries;
  await getEchoServerPermissionAggregate(pool, 'S');
  assert.equal(queries, before, 'warm aggregate read issues no query');
}

async function run(): Promise<void> {
  await genericCoalescer();
  await aggregateConcurrentLoad();
  console.log('keyedCoalescer.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
