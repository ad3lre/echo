import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '../../../shared/echoEmojiCdn';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { emojiEtag } from '../services/echoEmojiAsset';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from '../services/localUploadDisk';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

function clearRequireCacheBySubstring(substrings: string[]) {
  for (const k of Object.keys(require.cache)) {
    if (substrings.some((s) => k.includes(s))) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

function clearBackendSingletonsForRestart() {
  clearRequireCacheBySubstring([
    `${path.sep}backend${path.sep}src${path.sep}config.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}echoEmojiAsset.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}localUploadDisk.`,
    `${path.sep}backend${path.sep}src${path.sep}services${path.sep}s3UploadPresign.`,
    `${path.sep}backend${path.sep}src${path.sep}bootstrap${path.sep}`,
    `${path.sep}backend${path.sep}src${path.sep}api${path.sep}routes`,
  ]);
}

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `pubem_${id.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, `${username}@test.echo`, 'Public emoji route', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'echo.publicEmojiRoute: skip (PG_TEST_URL / DATABASE_URL not set)',
    );
    return;
  }

  const uploadRoot = await mkdtemp(path.join(tmpdir(), 'echo-pub-emoji-'));
  const restoreEnv = setEnv({
    ECHO_CONFIG_TEST_ISOLATION: '1',
    DATABASE_URL: databaseUrl,
    ECHO_BACKEND_STORAGE: 'postgres',
    ECHO_LOCAL_UPLOAD_DIR: uploadRoot,
    ECHO_LOCAL_UPLOADS: 'true',
    ECHO_S3_BUCKET: undefined,
    ECHO_S3_REGION: undefined,
    ECHO_S3_ACCESS_KEY: undefined,
    ECHO_S3_SECRET_KEY: undefined,
    ECHO_S3_ENDPOINT: undefined,
  });
  clearBackendSingletonsForRestart();

  const { config } = await import('../config');
  assert.ok(
    config.echoLocalUploadDir,
    'ECHO_LOCAL_UPLOAD_DIR must be set for public emoji route test',
  );

  const { ensureEchoTables } = await import('../db/echoTables');
  const { createEchoServer, createEchoCustomEmojiPack } =
    await import('../domain/echoStore');
  const { buildEchoTestApp } = await import('./helpers/echoTestApp');

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const runTag = `${Date.now().toString(36)}`;
  const ownerId = `pub_emoji_owner_${runTag}`;
  let serverId = '';
  const emojiId = nextEchoSnowflakeId();
  const storageKey = `echo/emoji/srv/u1/${runTag}.png`;

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    const created = await createEchoServer(pool, ownerId, 'pub-emoji-route');
    serverId = created.serverId;

    const pack = await createEchoCustomEmojiPack(
      pool,
      serverId,
      ownerId,
      'Pack',
      'Public route test pack',
      { tags: [] },
      false,
    );
    assert.equal(pack.ok, true);
    if (!pack.ok) return;

    await mkdir(path.join(uploadRoot, 'echo', 'emoji', 'srv', 'u1'), {
      recursive: true,
    });
    await writeFile(path.join(uploadRoot, storageKey), PNG_1X1);

    const imageUrl = `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}${encodeURIComponent(storageKey)}`;
    await pool.query(
      `INSERT INTO echo_server_custom_emojis (
         id, server_id, pack_id, name, animated, image_url, expression_kind
       ) VALUES ($1, $2, $3, 'wave', false, $4, 'emoji')`,
      [emojiId, serverId, pack.packId, imageUrl],
    );

    const rowRes = await pool.query<{
      id: string;
      server_id: string;
      name: string;
      animated: boolean;
      image_url: string;
      discord_source_emoji_id: string | null;
      created_at: Date;
      updated_at: Date;
      public_cdn_url: string | null;
    }>(
      `SELECT id, server_id, name, animated, image_url, discord_source_emoji_id,
              created_at, updated_at, public_cdn_url
       FROM echo_server_custom_emojis WHERE id = $1`,
      [emojiId],
    );
    const row = rowRes.rows[0]!;
    const etag = emojiEtag(row);

    const { fastify, close } = await buildEchoTestApp();
    try {
      const routePath = `${ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX}${emojiId}`;
      const res = await fastify.inject({
        method: 'GET',
        url: routePath,
      });
      assert.equal(res.statusCode, 200, res.body);
      assert.match(
        String(res.headers['cache-control'] ?? ''),
        /public.*immutable/,
      );
      assert.equal(res.headers.etag, etag);
      assert.ok(res.rawPayload.length > 0);

      const res304 = await fastify.inject({
        method: 'GET',
        url: routePath,
        headers: { 'if-none-match': etag },
      });
      assert.equal(res304.statusCode, 304);

      const stickerId = nextEchoSnowflakeId();
      await pool.query(
        `INSERT INTO echo_server_custom_emojis (
           id, server_id, pack_id, name, animated, image_url, expression_kind
         ) VALUES ($1, $2, $3, 'sticker', false, $4, 'sticker')`,
        [stickerId, serverId, pack.packId, imageUrl],
      );
      const stickerRes = await fastify.inject({
        method: 'GET',
        url: `${ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX}${stickerId}`,
      });
      assert.equal(stickerRes.statusCode, 404);
    } finally {
      await close();
    }
  } finally {
    restoreEnv();
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.end();
    await rm(uploadRoot, { recursive: true, force: true });
  }

  console.log('echo.publicEmojiRoute: ok');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
