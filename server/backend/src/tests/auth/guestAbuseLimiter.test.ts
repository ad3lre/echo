import assert from 'node:assert/strict';
import {
  __resetGuestAbuseLimiterForTests,
  evaluateGuestMint,
  recordGuestMintSuccess,
} from '../../services/auth/guestAbuseLimiter';

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  __resetGuestAbuseLimiterForTests();
  const ip = '203.0.113.50';
  const now = 1_700_000_000_000;

  const g0 = await evaluateGuestMint(ip, now);
  assert.equal(g0.ok, true);

  for (let i = 0; i < 12; i++) {
    await recordGuestMintSuccess(ip, now + i * 1000);
  }

  const g1 = await evaluateGuestMint(ip, now + 5000);
  assert.equal(g1.ok, false);
  if (g1.ok) throw new Error('expected limit');
  assert.equal(g1.reason, 'GUEST_MINT_LIMIT');

  // eslint-disable-next-line no-console
  console.log('guestAbuseLimiter.test: ok');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
