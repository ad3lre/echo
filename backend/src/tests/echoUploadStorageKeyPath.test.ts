/**
 * Upload storage key path safety + local disk resolve containment.
 * Run: node --import tsx backend/src/tests/echoUploadStorageKeyPath.test.ts
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isSafeEchoUploadStorageKeyPath,
  normalizeEchoUploadStorageKeyPath,
} from '../../../shared/echoUploadStorageKey';

function setEnv(next: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(next)) {
    prev[k] = process.env[k];
    const v = next[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of Object.keys(next)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

function clearConfigCache(): void {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}backend${path.sep}src${path.sep}config.`)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
    if (
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}services${path.sep}localUploadDisk.`,
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function runSharedValidationTests(): Promise<void> {
  assert.equal(
    normalizeEchoUploadStorageKeyPath('  echo/channels/c/u/x.png  '),
    'echo/channels/c/u/x.png',
  );
  assert.equal(normalizeEchoUploadStorageKeyPath(''), null);
  assert.equal(normalizeEchoUploadStorageKeyPath('..'), null);
  assert.equal(normalizeEchoUploadStorageKeyPath('echo/a/../b'), null);
  assert.equal(normalizeEchoUploadStorageKeyPath('/echo/x'), null);
  assert.equal(isSafeEchoUploadStorageKeyPath('a'.repeat(513)), false);
}

async function runLocalResolveTests(): Promise<void> {
  const uploadRoot = await mkdtemp(path.join(tmpdir(), 'echo-upload-path-'));
  const restore = setEnv({
    ECHO_CONFIG_TEST_ISOLATION: '1',
    ECHO_LOCAL_UPLOAD_DIR: uploadRoot,
    ECHO_LOCAL_UPLOADS: 'true',
  });
  clearConfigCache();

  try {
    const { resolveLocalUploadFilePath } =
      await import('../services/localUploadDisk');
    const legitKey = 'echo/channels/ch1/u1/safe.png';
    const legitDir = path.join(uploadRoot, 'echo', 'channels', 'ch1', 'u1');
    await mkdir(legitDir, { recursive: true });
    await writeFile(path.join(legitDir, 'safe.png'), Buffer.from('ok'));

    const legitAbs = resolveLocalUploadFilePath(legitKey);
    assert.ok(legitAbs, 'legitimate key must resolve');
    assert.ok(
      legitAbs!.startsWith(path.normalize(uploadRoot + path.sep)),
      'resolved path must stay under upload root',
    );

    const traversalAttempts = [
      '../../../etc/passwd',
      'echo/channels/../../outside.png',
      '..%2F..%2Fsecret',
      '/echo/channels/x.png',
      'echo/channels/x.png/../../../outside.png',
    ];
    for (const bad of traversalAttempts) {
      assert.equal(
        resolveLocalUploadFilePath(bad),
        null,
        `must reject traversal key: ${bad}`,
      );
    }
  } finally {
    restore();
    clearConfigCache();
    await rm(uploadRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await runSharedValidationTests();
  await runLocalResolveTests();
  console.log('echoUploadStorageKeyPath.test: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
