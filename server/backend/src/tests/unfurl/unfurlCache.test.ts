import assert from 'node:assert/strict';
import type { Embed } from '../../../../../contracts/types';
import {
  resetEchoUnfurlCacheForTests,
  unfurlWithCoalescedCache,
} from '../../services/linkUnfurl/unfurlCache';

function embed(url: string): Embed {
  return { url, title: url };
}

async function run(): Promise<void> {
  resetEchoUnfurlCacheForTests();

  // A resolved success is reused within the TTL (one loader call for repeats).
  {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve(embed('https://a.test'));
    };
    const first = await unfurlWithCoalescedCache('https://a.test', load);
    const second = await unfurlWithCoalescedCache('https://a.test', load);
    assert.equal(calls, 1, 'cached success not refetched');
    assert.deepEqual(first, second);
  }

  // Concurrent identical URLs share one in-flight fetch.
  {
    resetEchoUnfurlCacheForTests();
    let calls = 0;
    const slow = () => {
      calls += 1;
      return new Promise<Embed | null>((resolve) =>
        setTimeout(() => resolve(embed('https://b.test')), 5),
      );
    };
    const [a, b, c] = await Promise.all([
      unfurlWithCoalescedCache('https://b.test', slow),
      unfurlWithCoalescedCache('https://b.test', slow),
      unfurlWithCoalescedCache('https://b.test', slow),
    ]);
    assert.equal(calls, 1, 'concurrent identical URLs coalesce to one fetch');
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  }

  // Distinct URLs do not collide.
  {
    resetEchoUnfurlCacheForTests();
    const r1 = await unfurlWithCoalescedCache('https://x.test', () =>
      Promise.resolve(embed('https://x.test')),
    );
    const r2 = await unfurlWithCoalescedCache('https://y.test', () =>
      Promise.resolve(embed('https://y.test')),
    );
    assert.equal(r1?.url, 'https://x.test');
    assert.equal(r2?.url, 'https://y.test');
  }

  // A failed unfurl (null) is negatively cached so a dead host is not hammered.
  {
    resetEchoUnfurlCacheForTests();
    let calls = 0;
    const loadNull = () => {
      calls += 1;
      return Promise.resolve<Embed | null>(null);
    };
    const a = await unfurlWithCoalescedCache('https://dead.test', loadNull);
    const b = await unfurlWithCoalescedCache('https://dead.test', loadNull);
    assert.equal(a, null);
    assert.equal(b, null);
    assert.equal(calls, 1, 'negative result cached within failure TTL');
  }

  console.log('unfurlCache.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
