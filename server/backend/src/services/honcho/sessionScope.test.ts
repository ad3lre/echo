import assert from 'node:assert/strict';
import { echoHonchoSessionId } from './memory';

assert.equal(echoHonchoSessionId('u1', 'channel-1'), 'echo:u1:channel-1');
assert.notEqual(
  echoHonchoSessionId('u1', 'channel-1'),
  echoHonchoSessionId('u2', 'channel-1'),
);
assert.throws(() => echoHonchoSessionId('u1', 'x'.repeat(129)));
assert.throws(() => echoHonchoSessionId('u1', 'bad\nvalue'));
console.log('Honcho session scope regressions: ok');
