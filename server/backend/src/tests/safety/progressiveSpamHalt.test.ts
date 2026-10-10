import assert from 'node:assert/strict';
import {
  __resetProgressiveSpamHaltForTests,
  __spamHaltDurationsForTests,
  formatSpamHaltDuration,
  getActiveSpamHalt,
  recordSpamStrikeAndHalt,
} from '../../services/auth/progressiveSpamHalt';

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  __resetProgressiveSpamHaltForTests();

  const ladder = __spamHaltDurationsForTests();
  assert.equal(ladder.length, 5);
  assert.equal(formatSpamHaltDuration(60_000), '1m');
  assert.equal(formatSpamHaltDuration(5 * 60_000), '5m');

  const userId = 'spam-halt-user-1';
  const ip = '203.0.113.9';

  const first = await recordSpamStrikeAndHalt(userId, ip, 1_000_000);
  assert.equal(first.strikeCount, 1);
  assert.equal(first.haltDurationMs, ladder[0]);
  assert.equal(first.active, true);

  let snap = await getActiveSpamHalt(userId, ip, 1_000_000 + 30_000);
  assert.equal(snap.active, true);
  assert.match(snap.detail, /strike 1/i);

  snap = await getActiveSpamHalt(userId, ip, 1_000_000 + ladder[0]! + 1);
  assert.equal(snap.active, false);

  const second = await recordSpamStrikeAndHalt(userId, ip, 2_000_000);
  assert.equal(second.strikeCount, 2);
  assert.equal(second.haltDurationMs, ladder[1]);

  const third = await recordSpamStrikeAndHalt(userId, null, 3_000_000);
  assert.equal(third.strikeCount, 3);
  assert.equal(third.haltDurationMs, ladder[2]);

  // IP halt from earlier strikes should still bind a different guest on same IP
  // only while that IP halt is active — after strike 2 at t=2e6, IP halt ends at
  // 2e6 + 5m. At t=3e6 that IP halt has expired; user halt from strike 3 is active.
  snap = await getActiveSpamHalt('other-user', ip, 3_000_000);
  assert.equal(snap.active, false);

  await recordSpamStrikeAndHalt(userId, ip, 4_000_000);
  await recordSpamStrikeAndHalt(userId, ip, 5_000_000);
  const fifth = await recordSpamStrikeAndHalt(userId, ip, 6_000_000);
  assert.equal(fifth.strikeCount, 6);
  assert.equal(fifth.haltDurationMs, ladder[4]);

  console.log('progressiveSpamHalt.test: ok');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
