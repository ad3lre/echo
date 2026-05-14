import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import { createEchoServer, createEchoChannel } from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `forumjson_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@forum.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Forum JSON test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.forumJsonColumns: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `forum_json_owner_${Date.now().toString(36)}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    const created = await createEchoServer(pool, ownerId, 'forum-json-test');
    serverId = created.serverId;

    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    const categoryId = String(cat.rows[0]!.id);

    const forumId = await createEchoChannel(
      pool,
      serverId,
      'forum',
      'forum',
      categoryId,
      undefined,
      {
        forumAvailableTags: [
          { id: 'tag-news', name: 'News', emoji: null },
          { id: 'tag-help', name: 'Help', emoji: { id: null, name: 'wave' } },
        ],
      },
    );
    if (forumId === 'invalid_category') assert.fail('forum channel');

    const forumPostId = await createEchoChannel(
      pool,
      serverId,
      'forum post',
      'text',
      categoryId,
      undefined,
      {
        parentChannelId: forumId,
        forumPostTagIds: ['tag-help'],
      },
    );
    if (forumPostId === 'invalid_category') assert.fail('forum post channel');

    const forumRow = await pool.query(
      `SELECT forum_available_tags, forum_post_tag_ids
       FROM echo_channels
       WHERE server_id = $1 AND id = $2`,
      [serverId, forumId],
    );
    assert.deepEqual(forumRow.rows[0]?.forum_available_tags, [
      { id: 'tag-news', name: 'News', emoji: null },
      { id: 'tag-help', name: 'Help', emoji: { id: null, name: 'wave' } },
    ]);
    assert.equal(forumRow.rows[0]?.forum_post_tag_ids, null);

    const forumPostRow = await pool.query(
      `SELECT forum_post_tag_ids, parent_channel_id
       FROM echo_channels
       WHERE server_id = $1 AND id = $2`,
      [serverId, forumPostId],
    );
    assert.deepEqual(forumPostRow.rows[0]?.forum_post_tag_ids, ['tag-help']);
    assert.equal(
      String(forumPostRow.rows[0]?.parent_channel_id ?? ''),
      forumId,
    );

    console.log('echo.forumJsonColumns: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [ownerId]);
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
