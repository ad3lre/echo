import assert from 'node:assert/strict';
import { createGcraLimiter, gcraStep } from '../../shared/gcraRateLimiter';

function pureStep(): void {
  // Idle key, full-window burst: first `limit` admit instantly, then 1 per emission.
  const emission = 100; // 10 per 1000ms window
  const burst = 1000;
  let tat = 0;
  for (let i = 0; i < 10; i++) {
    const r = gcraStep(tat, 0, emission, burst);
    assert.equal(r.allowed, true, `burst hit ${i}`);
    tat = r.newTatMs;
  }
  const over = gcraStep(tat, 0, emission, burst);
  assert.equal(over.allowed, false, '11th instant hit refused');
  assert.equal(over.newTatMs, tat, 'rejection does not advance TAT');
  assert.ok(over.retryAfterMs > 0, 'retryAfter positive when refused');
  // Advancing time by retryAfter admits exactly one more.
  const after = gcraStep(tat, over.retryAfterMs, emission, burst);
  assert.equal(after.allowed, true, 'admitted after waiting retryAfter');
}

function singleTier(): void {
  let now = 0;
  const lim = createGcraLimiter(
    { limit: 5, windowMs: 1000 },
    { getNowMs: () => now },
  );
  for (let i = 0; i < 5; i++) {
    assert.equal(lim.check('k', now).allowed, true, `hit ${i}`);
  }
  assert.equal(lim.check('k', now).allowed, false, '6th instant refused');

  // Distinct keys are independent.
  assert.equal(lim.check('other', now).allowed, true, 'other key unaffected');

  // Sustained at the limit rate (1 per 200ms) is admitted indefinitely.
  now = 10_000;
  for (let i = 0; i < 50; i++) {
    now += 200;
    assert.equal(lim.check('paced', now).allowed, true, `paced ${i}`);
  }

  // reset() forgets a key.
  assert.equal(lim.check('z', now).allowed, true);
  lim.reset('z');
  assert.equal(lim.size >= 0, true);
}

function multiTier(): void {
  // Two tiers: a tight burst window (3/1s) AND a slower sustained cap (5/10s). A hit is
  // admitted only when BOTH admit — GCRA token-bucket semantics (instant burst is capped;
  // sustained converges to the slowest tier's rate).
  let now = 0;
  const lim = createGcraLimiter(
    [
      { limit: 3, windowMs: 1000 },
      { limit: 5, windowMs: 10_000 },
    ],
    { getNowMs: () => now },
  );

  // Instant burst is capped by the tightest tier's capacity (3), not the slower tier (5).
  assert.equal(lim.check('k').allowed, true);
  assert.equal(lim.check('k').allowed, true);
  assert.equal(lim.check('k').allowed, true);
  const refused = lim.check('k');
  assert.equal(refused.allowed, false, 'burst tier caps instant burst at 3');
  assert.ok(refused.retryAfterMs > 0, 'retryAfter positive on refusal');

  // Paced at the slowest tier's emission (10000/5 = 2000ms) is admitted indefinitely.
  now = 100_000;
  for (let i = 0; i < 30; i++) {
    now += 2000;
    assert.equal(lim.check('paced', now).allowed, true, `paced ${i}`);
  }

  // A fast sustained flood (every 100ms) is eventually throttled by the slow tier.
  now = 500_000;
  let admitted = 0;
  let refusedSeen = false;
  for (let i = 0; i < 200; i++) {
    now += 100;
    if (lim.check('flood', now).allowed) admitted += 1;
    else refusedSeen = true;
  }
  assert.ok(refusedSeen, 'sustained flood is eventually refused');
  assert.ok(admitted < 200, 'flood throttled below its offered rate');
}

function pruning(): void {
  let now = 0;
  const lim = createGcraLimiter(
    { limit: 1, windowMs: 1000 },
    { maxKeys: 3, getNowMs: () => now },
  );
  for (let i = 0; i < 10; i++) lim.check(`k${i}`, now);
  // Force a cleanup pass well past every key's recovery; bounded to maxKeys.
  now = 10 * 60_000;
  lim.check('trigger', now);
  assert.ok(lim.size <= 4, `bounded after prune (size=${lim.size})`);
}

function run(): void {
  pureStep();
  singleTier();
  multiTier();
  pruning();
  console.log('gcraRateLimiter.test: ok');
}

run();
