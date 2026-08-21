import assert from 'node:assert/strict';
import {
  createSocketOpEnvelope,
  socketOpsPerMinuteFromEnv,
} from '../../sockets/socketOpEnvelope';

function run(): void {
  const start = 1_700_000_000_000;

  // Burst tolerance: a full window's budget is admitted instantly.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 120 });
    for (let i = 0; i < 120; i++) {
      assert.equal(envelope.admit(start), true, `burst op ${i} should pass`);
    }
    assert.equal(
      envelope.admit(start),
      false,
      'op past budget must be refused',
    );
  }

  // Sustained rate at the configured pace is admitted indefinitely.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 60 });
    const intervalMs = 1000; // 60/min = one per second
    for (let i = 0; i < 600; i++) {
      assert.equal(
        envelope.admit(start + i * intervalMs),
        true,
        `paced op ${i} should pass`,
      );
    }
  }

  // Sustained rate above the envelope is eventually refused.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 60 });
    const intervalMs = 100; // 10x the allowed pace
    let refusedAt = -1;
    for (let i = 0; i < 1200; i++) {
      if (!envelope.admit(start + i * intervalMs)) {
        refusedAt = i;
        break;
      }
    }
    assert.notEqual(refusedAt, -1, 'flood must eventually be refused');
  }

  // Budget recovers after idle time.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 60 });
    for (let i = 0; i < 60; i++) {
      assert.equal(envelope.admit(start), true);
    }
    assert.equal(envelope.admit(start), false);
    const afterIdle = start + 120_000;
    assert.equal(
      envelope.admit(afterIdle),
      true,
      'budget must recover after idle',
    );
  }

  // A refused op consumes no budget: time alone restores admission.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 60 });
    for (let i = 0; i < 60; i++) {
      envelope.admit(start);
    }
    assert.equal(envelope.admit(start), false);
    assert.equal(envelope.admit(start), false);
    assert.equal(
      envelope.admit(start + 1001),
      true,
      'one emission interval restores one op',
    );
  }

  // Floor: configured values below the minimum are clamped, not rejected.
  {
    const envelope = createSocketOpEnvelope({ opsPerMinute: 1 });
    let admitted = 0;
    for (let i = 0; i < 60; i++) {
      if (envelope.admit(start)) admitted += 1;
    }
    assert.equal(admitted, 60, 'minimum envelope admits 60 burst ops');
  }

  // Env parsing: default on missing/garbage, clamped into the valid range.
  assert.equal(socketOpsPerMinuteFromEnv(undefined), 1800);
  assert.equal(socketOpsPerMinuteFromEnv(''), 1800);
  assert.equal(socketOpsPerMinuteFromEnv('not-a-number'), 1800);
  assert.equal(socketOpsPerMinuteFromEnv('600'), 600);
  assert.equal(socketOpsPerMinuteFromEnv('5'), 60);
  assert.equal(socketOpsPerMinuteFromEnv('999999999'), 60_000);

  console.log('socketOpEnvelope.test: ok');
}

run();
