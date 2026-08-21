import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  createEchoCustomEmojiPack,
  createEchoServer,
  resolveEchoEmojiTokens,
} from '../../domain/echoStore';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from '../../services/uploads/localUploadDisk';
import {
  buildEchoPublicEmojiCdnPath,
  clientImageUrlForResolvedEmoji,
  customEmojiStoredUrlNeedsAssetProxy,
  extractStorageKeyFromEchoMediaUrl,
} from '../../services/echoEmojiAsset';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `emoj_${id.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
  const email = `${username}@emoji.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Emoji asset test', passwordHash],
  );
}

async function run(): Promise<void> {
  assert.equal(
    extractStorageKeyFromEchoMediaUrl(
      `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}echo%2Femoji%2Fs1%2Fu1%2Fwave.webp`,
    ),
    'echo/emoji/s1/u1/wave.webp',
  );
  assert.equal(
    customEmojiStoredUrlNeedsAssetProxy(
      `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}echo/emoji/s1/u1/wave.webp`,
    ),
    true,
  );
  assert.equal(
    customEmojiStoredUrlNeedsAssetProxy('https://cdn.example.com/emoji/x.webp'),
    false,
  );

  const emojiId = '304238867010606080';
  const storedProxy = `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}echo%2Femoji%2Fsrv%2Fu1%2Fe.webp`;
  const client = clientImageUrlForResolvedEmoji(emojiId, storedProxy);
  assert.ok(
    client.assetUrl?.includes(buildEchoPublicEmojiCdnPath(emojiId)),
    'assetUrl should use public emoji CDN path',
  );
  assert.equal(client.imageUrl, client.assetUrl);
  const allowedPublishedPath = `${buildEchoPublicEmojiCdnPath(emojiId)}.webp`;
  const published = clientImageUrlForResolvedEmoji(emojiId, storedProxy, {
    publicCdnUrl: allowedPublishedPath,
  });
  assert.equal(published.imageUrl, allowedPublishedPath);

  const poisoned = clientImageUrlForResolvedEmoji(emojiId, storedProxy, {
    publicCdnUrl: 'https://evil.example/echo/public-emojis/x.webp',
  });
  assert.ok(
    poisoned.imageUrl.includes(buildEchoPublicEmojiCdnPath(emojiId)),
    'rejects disallowed public_cdn_url',
  );

  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.emojiAsset DB: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ownerA = `emoji_owner_a_${runTag}`;
  const viewerB = `emoji_viewer_b_${runTag}`;
  let serverA = '';
  let serverB = '';
  let emojiRowId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerA);
    await insertAuthUser(pool, viewerB);

    const createdA = await createEchoServer(pool, ownerA, 'emoji-server-a');
    serverA = createdA.serverId;
    const createdB = await createEchoServer(pool, viewerB, 'emoji-server-b');
    serverB = createdB.serverId;

    const pack = await createEchoCustomEmojiPack(
      pool,
      serverA,
      ownerA,
      'Pack A',
      'Test pack for cross-guild emoji assets',
      { tags: [] },
      false,
    );
    assert.equal(pack.ok, true);
    if (!pack.ok) return;

    emojiRowId = nextEchoSnowflakeId();
    await pool.query(
      `INSERT INTO echo_server_custom_emojis (
         id, server_id, pack_id, name, animated, image_url, expression_kind
       ) VALUES ($1, $2, $3, 'wave', false, $4, 'emoji')`,
      [emojiRowId, serverA, pack.packId, storedProxy],
    );

    const resolved = await resolveEchoEmojiTokens(pool, viewerB, [emojiRowId]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]!.id, emojiRowId);
    assert.ok(
      resolved[0]!.assetUrl?.includes(buildEchoPublicEmojiCdnPath(emojiRowId)),
      'resolve assetUrl should use public emoji CDN path',
    );
    assert.ok(
      resolved[0]!.imageUrl.includes(emojiRowId),
      'resolve imageUrl should reference emoji id',
    );

    const unrelated = await resolveEchoEmojiTokens(pool, viewerB, [
      '999999999999999999',
    ]);
    assert.equal(unrelated.length, 0);

    void serverB;
  } finally {
    if (serverA) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverA]);
    }
    if (serverB) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverB]);
    }
    await pool.end();
  }
}

run()
  .then(() => {
    console.log('echo.emojiAsset tests passed');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
