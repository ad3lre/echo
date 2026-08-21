import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.DATABASE_URL = '';
  process.env.USE_MOCK_DB = 'true';
  process.env.REDIS_URL = '';

  const { signLocalUploadToken, verifyLocalUploadToken } =
    await import('../../services/uploads/localUploadToken');
  const { consumeLocalUploadTokenOnce, __resetLocalUploadTokenReplayForTests } =
    await import('../../services/uploads/localUploadTokenReplay');

  __resetLocalUploadTokenReplayForTests();

  const token = signLocalUploadToken({
    storageKey: 'echo/channels/ch/u/file.png',
    userId: 'u1',
    contentType: 'image/png',
    contentLength: 128,
  });
  const payload = verifyLocalUploadToken(token);
  assert.ok(payload, 'token payload should verify');

  const first = await consumeLocalUploadTokenOnce(token, payload!.exp);
  assert.equal(first, true, 'first consume should pass');

  const second = await consumeLocalUploadTokenOnce(token, payload!.exp);
  assert.equal(second, false, 'replay consume should be rejected');

  const expired = await consumeLocalUploadTokenOnce(token, Date.now() - 1000);
  assert.equal(expired, false, 'expired consume should be rejected');

  console.log('localUploadTokenReplay: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
