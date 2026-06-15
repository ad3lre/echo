/**
 * Upload object-store routing when S3 and local disk are both configured.
 * Run: node --import tsx backend/src/tests/echoUploadObjectBackend.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';

function setEnv(overrides: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

function clearModule(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require.resolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
}

function clearBackendConfigCache() {
  clearModule('../config');
  for (const k of Object.keys(require.cache)) {
    if (
      k.includes(`${path.sep}backend${path.sep}src${path.sep}config.`) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}services${path.sep}s3UploadPresign.`,
      ) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}services${path.sep}echoUploadObjectBackend.`,
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function loadUploadRouting() {
  clearBackendConfigCache();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const backend =
    require('../services/echoUploadObjectBackend') as typeof import('../services/echoUploadObjectBackend');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const presign =
    require('../services/s3UploadPresign') as typeof import('../services/s3UploadPresign');
  return {
    ...backend,
    buildEchoUploadPublicUrlForStorageKey:
      presign.buildEchoUploadPublicUrlForStorageKey,
  };
}

async function run(): Promise<void> {
  const prevIsolation = process.env.ECHO_CONFIG_TEST_ISOLATION;
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  const restore = setEnv({
    NODE_ENV: 'test',
    ECHO_S3_BUCKET: 'echo-main',
    ECHO_S3_REGION: 'auto',
    ECHO_S3_ACCESS_KEY: 'test-key',
    ECHO_S3_SECRET_KEY: 'test-secret',
    ECHO_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    ECHO_S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
    ECHO_S3_PUBLIC_READ_THROUGH_API: 'true',
    ECHO_LOCAL_UPLOAD_DIR: '/tmp/echo-local-uploads-test',
  });
  try {
    const {
      echoUploadPrefersS3ObjectStore,
      echoUploadUsesLocalObjectStore,
      buildEchoUploadPublicUrlForStorageKey,
    } = await loadUploadRouting();

    const chatKey = 'echo/channels/123/user/abc.png';
    const wtKey = 'echo/vc-watch/u/user-1/clip.mkv';

    assert.equal(
      echoUploadPrefersS3ObjectStore(chatKey),
      true,
      'chat uploads must prefer S3 when both backends are configured',
    );
    assert.equal(
      echoUploadUsesLocalObjectStore(wtKey),
      true,
      'Watch Together must stay on local disk when local dir is set',
    );
    assert.equal(
      echoUploadPrefersS3ObjectStore(wtKey),
      false,
      'Watch Together must not route to S3',
    );

    const chatUrl = buildEchoUploadPublicUrlForStorageKey(chatKey);
    assert.ok(chatUrl, 'chat public URL should resolve');
    assert.ok(
      chatUrl.includes('/uploads/s3/') ||
        chatUrl.startsWith('https://cdn.example.test/'),
      `chat URL should target S3/read-through, got ${chatUrl}`,
    );
    assert.ok(
      !chatUrl.startsWith('/api/v1/echo/uploads/files/'),
      'chat URL must not point at local disk when S3 is configured',
    );

    const wtUrl = buildEchoUploadPublicUrlForStorageKey(wtKey);
    assert.ok(wtUrl?.startsWith('/api/v1/echo/uploads/files/'), wtUrl ?? '');
  } finally {
    restore();
    clearBackendConfigCache();
    if (prevIsolation === undefined)
      delete process.env.ECHO_CONFIG_TEST_ISOLATION;
    else process.env.ECHO_CONFIG_TEST_ISOLATION = prevIsolation;
  }
}

run()
  .then(() => {
    console.log('echoUploadObjectBackend.test.ts ok');
  })
  .catch((err) => {
    console.error('echoUploadObjectBackend.test.ts failed', err);
    process.exit(1);
  });
