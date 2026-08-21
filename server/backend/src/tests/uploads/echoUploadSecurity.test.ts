/**
 * Upload intent + media URL policy unit tests.
 * Run: node --import tsx server/backend/src/tests/uploads/echoUploadSecurity.test.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import type pg from 'pg';

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

function clearConfigAndRoutes() {
  clearModule('../../config');
  for (const k of Object.keys(require.cache)) {
    if (
      k.includes(`${path.sep}backend${path.sep}src${path.sep}config.`) ||
      k.includes(
        `${path.sep}backend${path.sep}src${path.sep}services${path.sep}uploads${path.sep}mediaUrlPolicy.`,
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

async function loadMediaUrlPolicy() {
  clearConfigAndRoutes();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../services/uploads/mediaUrlPolicy') as typeof import('../../../services/uploads/mediaUrlPolicy');
}

async function runMediaUrlPolicyTests(): Promise<void> {
  const restore = setEnv({
    NODE_ENV: 'test',
    ECHO_MEDIA_URL_REQUIRE_HTTPS: 'true',
    ECHO_MEDIA_URL_ALLOWED_HOSTS: '',
    ECHO_LOCAL_UPLOAD_DIR: '',
  });
  try {
    const { mediaUrlPassesEchoPolicy } = await loadMediaUrlPolicy();

    assert.equal(
      mediaUrlPassesEchoPolicy('https://example.invalid/x.png'),
      false,
      'external https must fail without allowlist',
    );
    assert.equal(
      mediaUrlPassesEchoPolicy('http://insecure.example/x.png'),
      false,
      'http must fail when https required',
    );
    assert.equal(
      mediaUrlPassesEchoPolicy('https://media.giphy.com/media/abc123/200.webp'),
      true,
      'known GIF CDN URLs are allowed without host allowlist',
    );
    assert.equal(
      mediaUrlPassesEchoPolicy(
        'https://images-ext-1.discordapp.net/external/x/https/example.com/a.png',
      ),
      true,
      'Discord CDN proxy URLs are allowed without host allowlist',
    );
  } finally {
    restore();
    await clearConfigAndRoutes();
  }
}

async function runUploadIntentTests(pool: pg.Pool): Promise<void> {
  const {
    insertEchoUploadIntent,
    isEchoChatUploadAttachmentRegistered,
    markEchoUploadIntentRegistered,
  } = await import('../../services/uploads/echoUploadIntent');
  const storageKey = `echo/channels/ch_test/u_test/intent-${Date.now()}.png`;
  const userId = 'u_test_intent';

  await insertEchoUploadIntent(pool, {
    storageKey,
    uploaderId: userId,
    channelId: 'ch_test',
    contentType: 'image/png',
    declaredByteLength: 42,
  });

  assert.equal(
    await isEchoChatUploadAttachmentRegistered(pool, storageKey, userId),
    false,
    'pending intent is not attachable',
  );

  await markEchoUploadIntentRegistered(pool, storageKey, 42);

  assert.equal(
    await isEchoChatUploadAttachmentRegistered(pool, storageKey, userId),
    true,
    'registered intent is attachable',
  );
  assert.equal(
    await isEchoChatUploadAttachmentRegistered(pool, storageKey, 'other_user'),
    false,
    'other user cannot attach',
  );
  assert.equal(
    await isEchoChatUploadAttachmentRegistered(
      pool,
      'echo/webhook-inbound/s/c/m/f.bin',
      'any',
    ),
    true,
    'webhook inbound exempt',
  );

  await pool.query(`DELETE FROM echo_upload_intent WHERE storage_key = $1`, [
    storageKey,
  ]);
}

async function runRetentionRegistrationTests(pool: pg.Pool): Promise<void> {
  const { isEchoChatUploadAttachmentRegistered } =
    await import('../../services/uploads/echoUploadIntent');
  const { registerChatUploadRetention } =
    await import('../../services/uploads/chatUploadRetention');
  const storageKey = `echo/channels/ch_ret/u_ret/import-${Date.now()}.gif`;
  const userId = 'u_ret_import';

  await registerChatUploadRetention(pool, {
    storageKey,
    byteLength: 128_000,
    sourceType: 'user',
    uploaderId: userId,
  });

  assert.equal(
    await isEchoChatUploadAttachmentRegistered(pool, storageKey, userId),
    true,
    'server-imported uploads registered via retention are attachable',
  );
  assert.equal(
    await isEchoChatUploadAttachmentRegistered(pool, storageKey, 'other_user'),
    false,
    'retention registration is scoped to uploader',
  );

  await pool.query(
    `DELETE FROM echo_chat_upload_retention WHERE storage_key = $1`,
    [storageKey],
  );
}

async function run(): Promise<void> {
  await runMediaUrlPolicyTests();

  const { getEchoStore } = await import('../../domain/echoStore');
  let storeState: Awaited<ReturnType<typeof getEchoStore>>;
  try {
    storeState = await getEchoStore();
  } catch {
    console.log('echoUploadSecurity.test: skip intent (postgres unavailable)');
    console.log('echoUploadSecurity.test: ok (media policy only)');
    return;
  }
  const { enabled, pool } = storeState;
  if (!enabled || !pool) {
    console.log('echoUploadSecurity.test: ok (media policy only)');
    return;
  }

  await runUploadIntentTests(pool);
  await runRetentionRegistrationTests(pool);
  console.log('echoUploadSecurity.test: ok');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
