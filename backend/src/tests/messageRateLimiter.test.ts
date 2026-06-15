import assert from 'node:assert/strict';
import { createSocketMessageRateLimiter } from '../sockets/messageRateLimiter';

/**
 * The limiter reads Date.now() internally, so this test drives time by stubbing it (the
 * GCRA core is time-injectable, but the socket wrapper keeps the simple boolean API).
 */
function withClock(fn: (setNow: (t: number) => void) => void): void {
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    fn((v) => {
      t = v;
    });
  } finally {
    Date.now = realNow;
  }
}

function run(): void {
  withClock((setNow) => {
    let now = 1_000_000;
    setNow(now);

    // burst 3 / 1s, per-minute 5 / 60s.
    const check = createSocketMessageRateLimiter({
      burstMax: 3,
      burstWindowMs: 1000,
      perMinute: 5,
    });

    // Instant burst capped at 3 (the burst tier), not the per-minute tier (5).
    assert.equal(check('u', 'c'), true);
    assert.equal(check('u', 'c'), true);
    assert.equal(check('u', 'c'), true);
    assert.equal(
      check('u', 'c'),
      false,
      'burst cap (3) blocks the 4th instant send',
    );

    // Different (user,channel) pairs are independent.
    assert.equal(check('u', 'c2'), true, 'other channel unaffected');
    assert.equal(check('u2', 'c'), true, 'other user unaffected');

    // A sustained flood (every 100ms) to one (user,channel) is eventually throttled.
    let admitted = 0;
    let refusedSeen = false;
    for (let i = 0; i < 200; i++) {
      now += 100;
      setNow(now);
      if (check('flood', 'c')) admitted += 1;
      else refusedSeen = true;
    }
    assert.ok(refusedSeen, 'sustained flood is eventually blocked');
    assert.ok(admitted < 200, 'flood throttled below offered rate');

    // Paced at the per-minute tier's emission (60000/5 = 12000ms) keeps sending.
    now += 60_000;
    setNow(now);
    for (let i = 0; i < 10; i++) {
      now += 12_000;
      setNow(now);
      assert.equal(check('paced', 'c'), true, `paced send ${i}`);
    }
  });

  console.log('messageRateLimiter.test: ok');
}

run();
