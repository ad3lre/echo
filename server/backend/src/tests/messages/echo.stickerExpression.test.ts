import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerCustomEmoji,
  createEchoCustomEmojiPack,
  createEchoServer,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `stk_${id.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
  const email = `${username}@sticker.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Sticker test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.stickerExpression DB: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const owner = `sticker_owner_${runTag}`;
  const viewer = `sticker_viewer_${runTag}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, owner);
    await insertAuthUser(pool, viewer);

    const created = await createEchoServer(pool, owner, 'sticker-server');
    serverId = created.serverId;

    const pack = await createEchoCustomEmojiPack(
      pool,
      serverId,
      owner,
      'Stickers',
      'Pack for sticker expression_kind tests',
      { tags: ['stickers'] },
      false,
    );
    assert.equal(pack.ok, true);
    if (!pack.ok) return;

    const added = await addEchoServerCustomEmoji(
      pool,
      serverId,
      owner,
      pack.packId,
      'wave_sticker',
      false,
      'https://cdn.example.com/stickers/wave.png',
      { expressionKind: 'sticker', stickerFormat: 'png' },
    );
    assert.equal(added.ok, true);
    if (!added.ok) return;

    const row = await pool.query<{
      expression_kind: string;
      sticker_format: string | null;
    }>(
      `SELECT expression_kind, sticker_format FROM echo_server_custom_emojis WHERE id = $1`,
      [added.emojiId],
    );
    assert.equal(row.rows[0]?.expression_kind, 'sticker');
    assert.equal(row.rows[0]?.sticker_format, 'png');

    const denied = await addEchoServerCustomEmoji(
      pool,
      serverId,
      viewer,
      pack.packId,
      'nope',
      false,
      'https://cdn.example.com/stickers/nope.png',
      { expressionKind: 'sticker', stickerFormat: 'png' },
    );
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.reason, 'forbidden');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id IN ($1, $2)`, [
      owner,
      viewer,
    ]);
    await pool.end();
  }
}

void run().then(
  () => console.log('echo.stickerExpression.test.ts ok'),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
