import assert from 'node:assert/strict';
import { normalizeRoutePath, parsePort } from '../config';

function run(): void {
  assert.equal(parsePort(undefined, 3050), 3050);
  assert.equal(parsePort('abc', 3050), 3050);
  assert.equal(parsePort('Infinity', 3050), 3050);
  assert.equal(parsePort('0', 3050), 1);
  assert.equal(parsePort('70000', 3050), 65_535);
  assert.equal(parsePort('3051.9', 3050), 3051);

  assert.equal(normalizeRoutePath(undefined, '/metrics'), '/metrics');
  assert.equal(normalizeRoutePath('', '/metrics'), '/metrics');
  assert.equal(normalizeRoutePath('/custom', '/metrics'), '/custom');
  assert.equal(normalizeRoutePath('custom', '/metrics'), '/custom');

  console.log('config.test: ok');
}

run();
