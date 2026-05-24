/**
 * Run: npx ts-node src/tests/echoMessageIdPgCompare.test.ts
 */
import assert from 'node:assert/strict';
import {
  echoMessageIdPgGreaterThan,
  echoMessageIdPgLessThan,
} from '../domain/echoMessageIdPgCompare';

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

test('echoMessageIdPgLessThan is swapped greaterThan', () => {
  assert.equal(
    echoMessageIdPgLessThan('anchor', 'id'),
    echoMessageIdPgGreaterThan('id', 'anchor'),
  );
});

test('greaterThan uses numeric branch for two snowflakes', () => {
  const sql = echoMessageIdPgGreaterThan('a', 'b');
  assert.match(sql, /a.*\^\[0-9\]\+\$/);
  assert.match(sql, /::numeric > \(b\)::numeric/);
});

void (async () => {
  if (process.exitCode) process.exit(1);
})();
