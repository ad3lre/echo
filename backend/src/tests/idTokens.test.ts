import assert from 'node:assert/strict';
import { findAllIdTokenMatches } from '../shared/idTokens';

function run(): void {
  // Each token kind parses with the right fields + rawLen.
  const animated = findAllIdTokenMatches('<a:wave:123>');
  assert.equal(animated.length, 1);
  assert.deepEqual(animated[0], {
    start: 0,
    end: 12,
    token: {
      kind: 'emoji',
      animated: true,
      name: 'wave',
      id: '123',
      rawLen: 12,
    },
  });

  const stat = findAllIdTokenMatches('<:hi:9>');
  assert.deepEqual(stat[0]?.token, {
    kind: 'emoji',
    animated: false,
    name: 'hi',
    id: '9',
    rawLen: 7,
  });

  assert.equal(findAllIdTokenMatches('<@!u_1>')[0]?.token.kind, 'user');
  assert.equal(findAllIdTokenMatches('<@u_1>')[0]?.token.kind, 'user');
  assert.equal(findAllIdTokenMatches('<#c_1>')[0]?.token.kind, 'channel');
  assert.equal(findAllIdTokenMatches('<@&r_1>')[0]?.token.kind, 'role');
  assert.equal(findAllIdTokenMatches('<$s_1>')[0]?.token.kind, 'server');
  assert.equal(findAllIdTokenMatches('<m:m_1>')[0]?.token.kind, 'message');

  // Mixed text: only the tokens are returned, with correct offsets.
  const mixed = findAllIdTokenMatches('hi <@u1> and <#c1>!');
  assert.equal(mixed.length, 2);
  assert.equal(mixed[0]?.token.kind, 'user');
  assert.equal(mixed[0]?.start, 3);
  assert.equal(mixed[1]?.token.kind, 'channel');
  assert.equal(mixed[1]?.start, 13);

  // Adjacent tokens with no separator.
  const adjacent = findAllIdTokenMatches('<@u1><#c1>');
  assert.equal(adjacent.length, 2);
  assert.equal(adjacent[1]?.start, 5);

  // Non-tokens / malformed angle brackets yield nothing and don't hang.
  assert.equal(findAllIdTokenMatches('a < b <not> <@>').length, 0);
  assert.equal(findAllIdTokenMatches('').length, 0);
  assert.equal(findAllIdTokenMatches('plain text, no tokens').length, 0);

  // Determinism across repeated calls (regexes are now shared module state; no `g`-flag
  // lastIndex bleed).
  for (let i = 0; i < 3; i++) {
    assert.equal(findAllIdTokenMatches('<@u1> <@u2>').length, 2, `call ${i}`);
  }

  console.log('idTokens.test: ok');
}

run();
