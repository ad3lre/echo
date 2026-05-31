import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hashBotTokenForStorage,
  legacySha256BotTokenHash,
  verifyBotTokenAgainstStoredHash,
} from '../services/botTokenHash';

describe('botTokenHash', () => {
  it('stores new tokens with bcrypt and verifies them', async () => {
    const token = 'Echo.dGVzdA.testsecretpart1234567890abcdef';
    const stored = await hashBotTokenForStorage(token);
    assert.ok(stored.startsWith('$2'));
    assert.equal(await verifyBotTokenAgainstStoredHash(token, stored), true);
    assert.equal(
      await verifyBotTokenAgainstStoredHash(`${token}x`, stored),
      false,
    );
  });

  it('still verifies legacy sha256 hashes', async () => {
    const token = 'Echo.legacy.token';
    const legacy = legacySha256BotTokenHash(token);
    assert.ok(!legacy.startsWith('$2'));
    assert.equal(await verifyBotTokenAgainstStoredHash(token, legacy), true);
    assert.equal(await verifyBotTokenAgainstStoredHash('other', legacy), false);
  });
});
