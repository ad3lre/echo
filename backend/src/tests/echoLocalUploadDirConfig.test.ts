import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';

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

function clearConfigModules(): void {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}backend${path.sep}src${path.sep}config`)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function run(): Promise<void> {
  const explicitDir = path.join(os.tmpdir(), 'echo-wt-explicit-local');
  const restore = setEnv({
    ECHO_LOCAL_UPLOAD_DIR: explicitDir,
    ECHO_S3_BUCKET: 'bucket',
    ECHO_S3_REGION: 'auto',
    ECHO_S3_ACCESS_KEY: 'key',
    ECHO_S3_SECRET_KEY: 'secret',
  });
  clearConfigModules();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEchoLocalUploadDir } =
      require('../config/storage') as typeof import('../config/storage');
    assert.equal(resolveEchoLocalUploadDir(), explicitDir);
    console.log('echoLocalUploadDirConfig.test: ok');
  } finally {
    restore();
    clearConfigModules();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
