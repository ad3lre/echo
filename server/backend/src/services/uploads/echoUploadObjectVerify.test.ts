/** Registration must decode claimed image bytes, not trust only metadata. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

async function run(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'echo-upload-verify-'));
  const previous = {
    isolation: process.env.ECHO_CONFIG_TEST_ISOLATION,
    storage: process.env.ECHO_BACKEND_STORAGE,
    local: process.env.ECHO_LOCAL_UPLOAD_DIR,
    localEnabled: process.env.ECHO_LOCAL_UPLOADS,
  };
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  process.env.ECHO_LOCAL_UPLOAD_DIR = root;
  process.env.ECHO_LOCAL_UPLOADS = 'true';

  try {
    const key = 'echo/channels/c/u/image.png';
    const abs = path.join(root, key);
    await mkdir(path.dirname(abs), { recursive: true });
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    await writeFile(abs, png);

    const { verifyEchoStoredUploadObject } =
      await import('./echoUploadObjectVerify');
    assert.deepEqual(
      await verifyEchoStoredUploadObject({
        storageKey: key,
        expectedByteLength: png.length,
        expectedContentType: 'image/png',
      }),
      { ok: true },
    );

    const badKey = 'echo/channels/c/u/fake.png';
    const badAbs = path.join(root, badKey);
    await writeFile(badAbs, Buffer.alloc(png.length, 0x41));
    const bad = await verifyEchoStoredUploadObject({
      storageKey: badKey,
      expectedByteLength: png.length,
      expectedContentType: 'image/png',
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, 'CONTENT_INVALID');
  } finally {
    if (previous.isolation === undefined)
      delete process.env.ECHO_CONFIG_TEST_ISOLATION;
    else process.env.ECHO_CONFIG_TEST_ISOLATION = previous.isolation;
    if (previous.storage === undefined) delete process.env.ECHO_BACKEND_STORAGE;
    else process.env.ECHO_BACKEND_STORAGE = previous.storage;
    if (previous.local === undefined) delete process.env.ECHO_LOCAL_UPLOAD_DIR;
    else process.env.ECHO_LOCAL_UPLOAD_DIR = previous.local;
    if (previous.localEnabled === undefined)
      delete process.env.ECHO_LOCAL_UPLOADS;
    else process.env.ECHO_LOCAL_UPLOADS = previous.localEnabled;
    await rm(root, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log('echoUploadObjectVerify.test: ok'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
