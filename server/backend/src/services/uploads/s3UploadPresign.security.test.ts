import assert from 'node:assert/strict';
import { test } from 'node:test';

// Use the real AWS signer with synthetic credentials; never contact S3.
require.cache[require.resolve('../../config')] = {
  exports: {
    config: {
      s3UploadBucket: 'test-bucket',
      s3UploadRegion: 'us-east-1',
      s3UploadAccessKey: 'test-access-key',
      s3UploadSecretKey: 'test-secret-key',
      s3UploadEndpoint: 'https://s3.example.invalid',
      s3UploadPublicBaseUrl: 'https://cdn.example.invalid',
      echoApiPublicUrl: 'https://echo.example.invalid',
    },
  },
} as NodeModule;
const { presignEchoUpload } =
  require('./s3UploadPresign') as typeof import('./s3UploadPresign');

test('client uploads must sign and send an immutable-object condition', async () => {
  const result = await presignEchoUpload({
    key: 'echo/channels/channel/user/image.png',
    contentType: 'image/png',
    contentLength: 100,
    maxBytes: 1024,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.headers['If-None-Match'], '*');
  const signedHeaders = new URL(result.uploadUrl).searchParams
    .get('X-Amz-SignedHeaders')!
    .split(';');
  assert.ok(
    signedHeaders.includes('if-none-match'),
    'clients must not be able to remove the condition',
  );
  assert.ok(signedHeaders.includes('content-length'));
  assert.equal(result.headers['Content-Type'], 'image/png');
});
