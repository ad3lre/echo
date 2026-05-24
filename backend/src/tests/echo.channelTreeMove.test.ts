import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  createEchoCategory,
  createEchoChannel,
  createEchoServer,
  patchEchoChannel,
  replaceEchoCategoryPermissionOverwrites,
  replaceEchoChannelPermissionOverwrites,
} from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `ctree_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@ctree.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Channel tree move test', passwordHash],
  );
}

async function grantChannelTreeTestPerms(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_roles
    SET permissions = permissions || '["MANAGE_ROLES","MANAGE_CHANNELS","MANAGE_GUILD","VIEW_CHANNEL"]'::jsonb
    WHERE server_id = $1 AND name = '@everyone'
    `,
    [serverId],
  );
}

async function countChannelOverwriteRows(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.channelTreeMove: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `ctree_owner_${Date.now().toString(36)}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    const created = await createEchoServer(pool, ownerId, 'ctree-test');
    serverId = created.serverId;
    await grantChannelTreeTestPerms(pool, serverId);

    const catARow = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
      [serverId],
    );
    const catAId = String(catARow.rows[0]!.id);

    const catB = await createEchoCategory(pool, serverId, ownerId, {
      name: 'Category B',
    });
    if (typeof catB !== 'object' || !('categoryId' in catB)) {
      assert.fail(`createEchoCategory: ${String(catB)}`);
    }
    const catBId = catB.categoryId;

    const channelId = await createEchoChannel(
      pool,
      serverId,
      'general',
      'text',
      catAId,
    );
    if (channelId === 'invalid_category') assert.fail('channel create');

    const chRows = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      channelId,
      [
        {
          targetType: 'everyone',
          partial: { SEND_MESSAGE: false },
        },
      ],
    );
    assert.equal(chRows, 'ok');
    assert.equal(await countChannelOverwriteRows(pool, serverId, channelId), 1);

    const catBRows = await replaceEchoCategoryPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      catBId,
      [
        {
          targetType: 'everyone',
          partial: { SEND_MESSAGE: true },
        },
      ],
    );
    assert.equal(catBRows, 'ok');

    const moved = await patchEchoChannel(pool, serverId, ownerId, channelId, {
      categoryId: catBId,
      siblingIndex: 0,
      moveOutOfCategoryPermission: 'sync',
    });
    assert.equal(moved, 'ok');
    assert.equal(await countChannelOverwriteRows(pool, serverId, channelId), 0);

    const chAfter = await pool.query(
      `SELECT permission_overrides FROM echo_channels WHERE id = $1`,
      [channelId],
    );
    assert.equal(chAfter.rows[0]?.permission_overrides, null);

    const catBUpdate = await replaceEchoCategoryPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      catBId,
      [
        {
          targetType: 'everyone',
          partial: { SEND_MESSAGE: false, VIEW_CHANNEL: true },
        },
      ],
    );
    assert.equal(catBUpdate, 'ok');
    assert.equal(await countChannelOverwriteRows(pool, serverId, channelId), 0);

    console.log('echo.channelTreeMove: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [ownerId]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
