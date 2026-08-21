import assert from 'node:assert/strict';
import {
  resolveSocketPresenceSetState,
  shouldMarkOffline,
} from '../../domain/echoPresenceAuthority';

const nowMs = 1_700_000_000_000;

{
  const next = resolveSocketPresenceSetState(
    {
      status: 'idle',
      updatedAtMs: nowMs - 5_000,
    },
    {
      payloadStatus: 'online',
      authenticatedStatus: 'online',
      occurredAtMs: nowMs,
      staleAfterMinutes: 5,
    },
  );
  assert.deepEqual(next, {
    status: 'idle',
    updatedAtMs: nowMs,
  });
}

{
  const next = resolveSocketPresenceSetState(
    {
      status: 'online',
      updatedAtMs: nowMs - 10 * 60_000,
    },
    {
      payloadStatus: 'online',
      authenticatedStatus: 'do_not_disturb',
      occurredAtMs: nowMs,
      staleAfterMinutes: 5,
    },
  );
  assert.deepEqual(next, {
    status: 'do_not_disturb',
    updatedAtMs: nowMs,
  });
}

{
  const next = resolveSocketPresenceSetState(undefined, {
    payloadStatus: 'idle',
    authenticatedStatus: 'online',
    occurredAtMs: nowMs,
    staleAfterMinutes: 5,
  });
  assert.deepEqual(next, {
    status: 'online',
    updatedAtMs: nowMs,
  });
}

assert.equal(shouldMarkOffline(nowMs - 6 * 60_000, nowMs, 5), true);
assert.equal(shouldMarkOffline(nowMs - 60_000, nowMs, 5), false);

console.log('echo.presenceAuthority.test: ok');
