import assert from 'node:assert/strict';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
process.env.NODE_ENV = 'development';
process.env.ECHO_BACKEND_STORAGE = 'memory';
process.env.DATABASE_URL = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-gates';

async function run(): Promise<void> {
  const {
    __resetLoginTrustedIpStoreForTests,
    issueLoginEmailIpOtp,
    isTrustedLoginIp,
    trustLoginIp,
    verifyLoginEmailIpOtp,
  } = await import('../../services/auth/loginTrustedIpStore');
  const { maskEmailAddress } = await import('../../services/auth/maskEmail');
  const { signLoginEmailPendingToken, verifyLoginEmailPendingToken } =
    await import('../../auth/token');

  assert.equal(maskEmailAddress('alice@echo.test'), 'a***@echo.test');
  assert.equal(maskEmailAddress('ab@x.y'), 'a***@x.y');

  const token = signLoginEmailPendingToken('user-1');
  const payload = verifyLoginEmailPendingToken(token);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.typ, 'login_email_pending');

  __resetLoginTrustedIpStoreForTests();
  const userId = 'user-gates-2';
  const ipDigest = 'ef01'.repeat(8);
  const emailNorm = 'bob@echo.test';

  assert.equal(await isTrustedLoginIp(userId, ipDigest), false);
  await trustLoginIp(userId, ipDigest);
  assert.equal(await isTrustedLoginIp(userId, ipDigest), true);

  __resetLoginTrustedIpStoreForTests();
  const { plainCode } = await issueLoginEmailIpOtp({
    userId,
    emailNorm,
    ipDigest,
  });
  assert.equal(plainCode.length, 6);
  assert.equal(
    await verifyLoginEmailIpOtp({
      userId,
      emailNorm,
      ipDigest,
      plainCode: '000000',
    }),
    false,
  );
  assert.equal(
    await verifyLoginEmailIpOtp({
      userId,
      emailNorm,
      ipDigest,
      plainCode,
    }),
    true,
  );
  assert.equal(
    await verifyLoginEmailIpOtp({
      userId,
      emailNorm,
      ipDigest,
      plainCode,
    }),
    false,
  );

  console.log('passwordLoginGates: ok');
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
