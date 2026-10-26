import assert from 'node:assert/strict';
import {
  DM_CALL_INVITE_MAX_PER_WINDOW,
  gateDmCallAccept,
  gateDmCallEnd,
  gateDmCallInvite,
  getDmCallPendingInviteForTests,
  resetDmCallSignalGateForTests,
} from './dmCallSignalGate';

async function run(): Promise<void> {
  resetDmCallSignalGateForTests();

  const t0 = 1_000_000;
  assert.deepEqual(
    gateDmCallInvite({
      userId: 'u1',
      channelId: 'ch1',
      correlationId: 'c1',
      now: t0,
    }),
    { ok: true },
  );
  assert.equal(getDmCallPendingInviteForTests('ch1')?.inviterUserId, 'u1');

  // Inviter cannot forge their own accept.
  assert.deepEqual(
    gateDmCallAccept({
      userId: 'u1',
      channelId: 'ch1',
      correlationId: 'c1',
      now: t0 + 1,
    }),
    { ok: false, reason: 'accept_by_inviter' },
  );

  // Peer can accept with matching correlation.
  assert.deepEqual(
    gateDmCallAccept({
      userId: 'u2',
      channelId: 'ch1',
      correlationId: 'c1',
      now: t0 + 2,
    }),
    { ok: true },
  );
  assert.equal(getDmCallPendingInviteForTests('ch1'), undefined);

  // Accept without a pending invite is rejected.
  assert.deepEqual(
    gateDmCallAccept({
      userId: 'u2',
      channelId: 'ch1',
      correlationId: 'c1',
      now: t0 + 3,
    }),
    { ok: false, reason: 'no_pending_invite' },
  );

  resetDmCallSignalGateForTests();
  assert.deepEqual(
    gateDmCallInvite({
      userId: 'u1',
      channelId: 'ch2',
      correlationId: 'c2',
      now: t0,
    }),
    { ok: true },
  );
  assert.deepEqual(
    gateDmCallAccept({
      userId: 'u2',
      channelId: 'ch2',
      correlationId: 'wrong',
      now: t0 + 1,
    }),
    { ok: false, reason: 'correlation_mismatch' },
  );

  // End clears pending so a later accept cannot land.
  assert.deepEqual(
    gateDmCallEnd({ userId: 'u1', channelId: 'ch2', now: t0 + 2 }),
    { ok: true },
  );
  assert.equal(getDmCallPendingInviteForTests('ch2'), undefined);

  resetDmCallSignalGateForTests();
  for (let i = 0; i < DM_CALL_INVITE_MAX_PER_WINDOW; i++) {
    assert.equal(
      gateDmCallInvite({
        userId: 'spammer',
        channelId: 'ch3',
        correlationId: `x${i}`,
        now: t0 + i,
      }).ok,
      true,
      `invite ${i} should pass`,
    );
  }
  assert.deepEqual(
    gateDmCallInvite({
      userId: 'spammer',
      channelId: 'ch3',
      correlationId: 'overflow',
      now: t0 + DM_CALL_INVITE_MAX_PER_WINDOW,
    }),
    { ok: false, reason: 'invite_rate_channel' },
  );

  console.log('dmCallSignalGate.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
