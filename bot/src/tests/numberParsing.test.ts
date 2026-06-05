import assert from 'node:assert/strict';
import {
  parseIntegerInRange,
  parseMinInteger,
  parseRetryAfterMs,
} from '../util/numberParsing.js';

function run(): void {
  assert.equal(parseIntegerInRange('abc', 90, 1, 100), 90);
  assert.equal(parseIntegerInRange('Infinity', 90, 1, 100), 90);
  assert.equal(parseIntegerInRange('-5', 90, 1, 100), 1);
  assert.equal(parseIntegerInRange('250', 90, 1, 100), 100);
  assert.equal(parseIntegerInRange('42.8', 90, 1, 100), 42);

  assert.equal(parseMinInteger('abc', 30_000, 5_000), 30_000);
  assert.equal(parseMinInteger('', 30_000, 5_000), 30_000);
  assert.equal(parseMinInteger('4_000', 30_000, 5_000), 30_000);
  assert.equal(parseMinInteger('4000', 30_000, 5_000), 5_000);
  assert.equal(parseMinInteger('6000.9', 30_000, 5_000), 6_000);

  assert.equal(parseRetryAfterMs('bogus', 2_000, 500, 30_000), 2_000);
  assert.equal(parseRetryAfterMs('-5', 2_000, 500, 30_000), 500);
  assert.equal(parseRetryAfterMs('0.75', 2_000, 500, 30_000), 750);
  assert.equal(parseRetryAfterMs('999', 2_000, 500, 30_000), 30_000);

  console.log('numberParsing.test: ok');
}

run();
