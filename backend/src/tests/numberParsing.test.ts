import assert from 'node:assert/strict';
import { boundedInteger, minInteger } from '../shared/numberParsing';

function run(): void {
  assert.equal(boundedInteger('abc', 50, 1, 200), 50);
  assert.equal(boundedInteger(Number.NaN, 50, 1, 200), 50);
  assert.equal(boundedInteger(Number.POSITIVE_INFINITY, 50, 1, 200), 50);
  assert.equal(boundedInteger('-5', 50, 1, 200), 1);
  assert.equal(boundedInteger('250', 50, 1, 200), 200);
  assert.equal(boundedInteger('12.8', 50, 1, 200), 12);

  assert.equal(minInteger('abc', 100, 0), 100);
  assert.equal(minInteger(Number.NaN, 100, 0), 100);
  assert.equal(minInteger(Number.POSITIVE_INFINITY, 100, 0), 100);
  assert.equal(minInteger('-5', 100, 0), 0);
  assert.equal(minInteger('12.8', 100, 0), 12);

  console.log('numberParsing.test: ok');
}

run();
