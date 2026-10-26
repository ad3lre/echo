import assert from 'node:assert/strict';
import { MemoryAuthStore } from './MemoryAuthStore';

async function run(): Promise<void> {
  const store = new MemoryAuthStore();
  const exp = new Date(Date.now() + 3_600_000).toISOString();
  await store.storeRefreshToken('u1', 'h1', exp);
  const r1 = await store.rotateRefreshTokenAtomic({
    tokenHash: 'h1',
    nextTokenHash: 'h2',
    nextExpiresAt: exp,
  });
  assert.equal(r1.ok, true);
  assert.ok(await store.findActiveRefreshToken('h2'));

  // Replaying the already-rotated token revokes the successor too.
  const replay = await store.rotateRefreshTokenAtomic({
    tokenHash: 'h1',
    nextTokenHash: 'h3',
    nextExpiresAt: exp,
  });
  assert.deepEqual(replay, { ok: false, reason: 'already_redeemed' });
  assert.equal(await store.findActiveRefreshToken('h2'), null);
  assert.equal((await store.listActiveRefreshTokensByUser('u1')).length, 0);

  // eslint-disable-next-line no-console
  console.log('refreshFamilyRevocation.test: ok');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
