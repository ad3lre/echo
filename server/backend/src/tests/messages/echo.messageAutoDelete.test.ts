import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  createEchoServer,
  listEchoCategories,
  patchEchoChannel,
  updateEchoCategory,
} from '../../domain/echoStore';
import {
  listEchoChannelsWithEffectiveAutoDelete,
  resolveEchoChannelAutoDeleteSeconds,
} from '../../domain/echoStore/messages/messageAutoDelete';
import {
  purgeEchoMessagesDeletedBefore,
  softDeleteEchoMessagesOlderThanInChannel,
} from '../../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `autodel_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@autodel.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Auto-delete test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.messageAutoDelete: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `autodel_owner_${Date.now().toString(36)}`;
  let serverId = '';
  let channelId = '';
  let categoryId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    const created = await createEchoServer(pool, ownerId, 'autodel-test');
    serverId = created.serverId;
    channelId = created.defaultChannelId;
    const cats = await listEchoCategories(pool, serverId);
    categoryId = cats[0]!.id;

    const rCat = await updateEchoCategory(pool, serverId, ownerId, categoryId, {
      autoDeleteAfterSeconds: 86_400,
    });
    assert.equal(rCat, 'ok');

    const rCh = await patchEchoChannel(pool, serverId, ownerId, channelId, {
      autoDeleteSyncedToCategory: true,
    });
    assert.equal(rCh, 'ok');

    const effective = await listEchoChannelsWithEffectiveAutoDelete(pool);
    const row = effective.find((c) => c.channelId === channelId);
    assert.ok(row);
    assert.equal(row!.effectiveSeconds, 86_400);

    assert.equal(
      resolveEchoChannelAutoDeleteSeconds({
        auto_delete_synced_to_category: true,
        channel_auto_delete_after_seconds: null,
        category_auto_delete_after_seconds: 86_400,
      }),
      86_400,
    );

    const msgId = nextEchoSnowflakeId();
    const old = new Date(Date.now() - 2 * 86_400 * 1000);
    await pool.query(
      `INSERT INTO echo_messages (id, channel_id, author_id, content, mentions, reply_to, created_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5)`,
      [msgId, channelId, ownerId, 'stale', old],
    );

    const soft = await softDeleteEchoMessagesOlderThanInChannel(
      pool,
      channelId,
      new Date(Date.now() - 86_400 * 1000),
      100,
    );
    assert.equal(soft.length, 1);
    assert.equal(soft[0]!.id, msgId);

    const deletedRow = await pool.query(
      `SELECT deleted_at FROM echo_messages WHERE id = $1`,
      [msgId],
    );
    assert.ok(deletedRow.rows[0]?.deleted_at);

    await purgeEchoMessagesDeletedBefore(
      pool,
      new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
      100,
    );
    const stillThere = await pool.query(
      `SELECT 1 FROM echo_messages WHERE id = $1`,
      [msgId],
    );
    assert.equal(stillThere.rows.length, 1);

    await purgeEchoMessagesDeletedBefore(
      pool,
      new Date(Date.now() + 60_000),
      100,
    );
    const gone = await pool.query(`SELECT 1 FROM echo_messages WHERE id = $1`, [
      msgId,
    ]);
    assert.equal(gone.rows.length, 0);

    const rDesync = await patchEchoChannel(pool, serverId, ownerId, channelId, {
      autoDeleteSyncedToCategory: false,
      autoDeleteAfterSeconds: 604_800,
    });
    assert.equal(rDesync, 'ok');

    const effective2 = await listEchoChannelsWithEffectiveAutoDelete(pool);
    const row2 = effective2.find((c) => c.channelId === channelId);
    assert.ok(row2);
    assert.equal(row2!.effectiveSeconds, 604_800);

    console.log('echo.messageAutoDelete: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [ownerId]);
    await pool.end();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
