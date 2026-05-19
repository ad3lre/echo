import assert from 'node:assert/strict';
import {
  applyPresenceSignal,
  buildPresenceMap,
  normalizePresenceStatus,
  shouldMarkOffline,
} from '../domain/echoPresenceAuthority';

function run(): void {
  assert.equal(normalizePresenceStatus('online'), 'online');
  assert.equal(normalizePresenceStatus('  idle '), 'idle');
  assert.equal(normalizePresenceStatus('dnd'), 'do_not_disturb');
  assert.equal(normalizePresenceStatus('busy'), 'do_not_disturb');
  assert.equal(normalizePresenceStatus('away'), undefined);

  assert.deepEqual(
    applyPresenceSignal(undefined, {
      source: 'http',
      status: '',
      occurredAtMs: 100,
    }),
    { status: 'online', updatedAtMs: 100 },
  );

  assert.deepEqual(
    applyPresenceSignal(undefined, {
      source: 'socket:heartbeat',
      status: 'busy',
      occurredAtMs: 200,
    }),
    { status: 'do_not_disturb', updatedAtMs: 200 },
  );

  assert.deepEqual(
    applyPresenceSignal(
      { status: 'idle', updatedAtMs: 100 },
      {
        source: 'disconnect',
        occurredAtMs: 300,
      },
    ),
    { status: 'offline', updatedAtMs: 300 },
  );

  assert.deepEqual(
    buildPresenceMap(
      [
        { userId: 'u1', status: 'online' },
        { userId: 'u2', status: 'busy' },
        { userId: 'u3', status: 'invalid' },
      ],
      ['u1', 'u2', 'u4'],
    ),
    {
      u1: 'online',
      u2: 'do_not_disturb',
      u4: 'offline',
    },
  );

  assert.equal(shouldMarkOffline(0, 59_000, 1), false);
  assert.equal(shouldMarkOffline(0, 60_000, 1), true);

  console.log('echoPresenceAuthority.test: ok');
}

run();
