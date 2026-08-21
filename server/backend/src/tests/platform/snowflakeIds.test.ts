/**
 * Run: npx ts-node src/tests/platform/snowflakeIds.test.ts
 */
import assert from 'node:assert/strict';
import {
  compareEchoPublicId,
  createSnowflakeGenerator,
  ECHO_SNOWFLAKE_EPOCH_MS,
  isEchoPublicId,
  parseSnowflakeTime,
} from '../../../../../contracts/snowflakeIds';

function test(name: string, fn: () => void) {
  try {
    fn();
    // eslint-disable-next-line no-console
    console.log(`ok ${name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

const futureNow = () => ECHO_SNOWFLAKE_EPOCH_MS + 400 * 86400_000;

test('isEchoPublicId rejects uuid and decorated', () => {
  assert.equal(isEchoPublicId('550e8400-e29b-41d4-a716-446655440000'), false);
  assert.equal(isEchoPublicId('msg_1234567890123456'), false);
  assert.equal(isEchoPublicId('0012345678901234567'), false);
  assert.equal(isEchoPublicId('12'), false);
});

test('compareEchoPublicId is numeric order', () => {
  assert(compareEchoPublicId('9', '10') < 0);
  assert(compareEchoPublicId('10', '9') > 0);
});

test('generator monotonic', () => {
  const next = createSnowflakeGenerator({
    workerId: 3,
    datacenterId: 2,
    now: futureNow,
  });
  const a = next();
  const b = next();
  assert(isEchoPublicId(a));
  assert(isEchoPublicId(b));
  assert(compareEchoPublicId(a, b) < 0);
});

test('parseSnowflakeTime roundtrip-ish', () => {
  const next = createSnowflakeGenerator({ workerId: 0, now: futureNow });
  const id = next();
  const d = parseSnowflakeTime(id);
  assert(d instanceof Date);
  assert(Math.abs(d.getTime() - futureNow()) < 5);
});

test('sequence overflow waits (mock clock)', () => {
  let t = futureNow();
  const next = createSnowflakeGenerator({
    workerId: 0,
    now: () => t,
    onWaitNextMs: () => {
      t += 1;
    },
  });
  let last = '';
  for (let i = 0; i < 4098; i++) {
    const id = next();
    if (last) assert(compareEchoPublicId(last, id) < 0);
    last = id;
  }
});

void (async () => {
  if (process.exitCode) process.exit(1);
})();
