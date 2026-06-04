import assert from 'node:assert/strict';
import {
  __resetLoginProtectionForTests,
  evaluateMfaLogin,
  evaluatePasswordLogin,
  loginProtectionKeyForUser,
  recordMfaLoginFailure,
  recordPasswordLoginFailure,
  recordPasswordLoginSuccess,
} from '../services/auth/loginProtection';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';

async function run(): Promise<void> {
  __resetLoginProtectionForTests();

  const accountKey = loginProtectionKeyForUser('user-test-1');
  let gate = await evaluatePasswordLogin(accountKey);
  assert.equal(gate.ok, true);

  for (let i = 0; i < 4; i++) {
    await recordPasswordLoginFailure(accountKey);
  }
  gate = await evaluatePasswordLogin(accountKey);
  assert.equal(gate.ok, true, 'backoff starts after 5 failures');

  await recordPasswordLoginFailure(accountKey);
  gate = await evaluatePasswordLogin(accountKey);
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.ok(gate.retryAfterMs > 0);
  }

  await recordPasswordLoginSuccess(accountKey);
  gate = await evaluatePasswordLogin(accountKey);
  assert.equal(gate.ok, true, 'success clears lockout state');

  __resetLoginProtectionForTests();
  const userId = 'user-mfa-test';
  for (let i = 0; i < 10; i++) {
    await recordMfaLoginFailure(userId);
  }
  const mfaGate = await evaluateMfaLogin(userId);
  assert.equal(mfaGate.ok, false);
  if (!mfaGate.ok) {
    assert.ok(mfaGate.retryAfterMs >= 60_000);
  }

  console.log('loginProtection: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
