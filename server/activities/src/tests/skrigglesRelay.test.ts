import assert from 'node:assert/strict';
import {
  SKRIGGLES_RELAY_MAX_ARRAY_LEN,
  skrigglesModule,
} from '../games/skriggles';

const state = {
  phase: 'drawing',
  drawerUserId: 'drawer',
  roundSeq: 3,
  roundSecret: 'cat',
} as never;

function relay(userId: string, payload: unknown, type = 'stroke_batch') {
  return skrigglesModule.relay!(state, payload, {
    userId,
    type,
    now: 0,
    revision: 0,
    roster: ['drawer'],
  });
}

export function runSkrigglesRelayTests(): void {
  // Client-supplied type/fromUserId must not override trusted ctx values.
  const out = relay('drawer', {
    roundSeq: 3,
    payload: { points: [1] },
    type: 'evil',
    fromUserId: 'victim',
  });
  assert.ok(out);
  const data = out.data as Record<string, unknown>;
  assert.equal(data.type, 'stroke_batch');
  assert.equal(data.fromUserId, 'drawer');

  // Non-drawer and wrong round are rejected.
  assert.equal(relay('other', { roundSeq: 3, payload: {} }), null);
  assert.equal(relay('drawer', { roundSeq: 2, payload: {} }), null);

  // Oversized payloads are dropped.
  assert.equal(
    relay('drawer', { roundSeq: 3, payload: { blob: 'x'.repeat(70 * 1024) } }),
    null,
  );

  // Oversized points arrays are truncated.
  const big = Array.from(
    { length: SKRIGGLES_RELAY_MAX_ARRAY_LEN + 500 },
    () => 1,
  );
  const capped = relay('drawer', { roundSeq: 3, payload: { points: big } });
  assert.ok(capped);
  const pts = (capped.data as { payload: { points: unknown[] } }).payload
    .points;
  assert.equal(pts.length, SKRIGGLES_RELAY_MAX_ARRAY_LEN);

  // Deeply nested payloads are rejected without stringify/recursion.
  let deep: unknown = 1;
  for (let i = 0; i < 50; i++) deep = { a: deep };
  assert.equal(relay('drawer', { roundSeq: 3, payload: deep }), null);

  // Too many nodes (many small objects) is rejected.
  const manyKeys = Object.fromEntries(
    Array.from({ length: 6000 }, (_, i) => [`k${i}`, 1]),
  );
  assert.equal(relay('drawer', { roundSeq: 3, payload: manyKeys }), null);

  // Non-draw arrays above the per-level cap are rejected.
  assert.equal(
    relay('drawer', {
      roundSeq: 3,
      payload: { other: Array.from({ length: 501 }, () => 1) },
    }),
    null,
  );
}
