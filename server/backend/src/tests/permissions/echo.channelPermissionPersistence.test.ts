import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  createEchoChannel,
  createEchoServer,
  listEchoChannelPermissionOverwrites,
  patchEchoChannel,
  replaceEchoChannelPermissionOverwrites,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `chperm_${id.replace(/[^a-z0-9]/gi, '')}`.slice(0, 32);
  const email = `${username}@chperm.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Channel perm persistence test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.channelPermissionPersistence: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const token = Date.now().toString(36);
  const ownerId = `chperm_owner_${token}`;

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    const created = await createEchoServer(pool, ownerId, 'chperm-test');
    const serverId = created.serverId;

    const categoryRes = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
      [serverId],
    );
    const categoryId = String(categoryRes.rows[0]!.id);

    const channelId = await createEchoChannel(
      pool,
      serverId,
      'embed-test',
      'text',
      categoryId,
    );
    if (channelId === 'invalid_category') {
      assert.fail('expected valid text channel category');
    }

    const saveEmbedDeny = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      channelId,
      [{ targetType: 'everyone', partial: { EMBED_LINKS: false } }],
    );
    assert.equal(saveEmbedDeny, 'ok');

    const patchName = await patchEchoChannel(
      pool,
      serverId,
      ownerId,
      channelId,
      { name: 'embed-test-renamed' },
    );
    assert.equal(patchName, 'ok');

    const rowsAfterRename = await listEchoChannelPermissionOverwrites(
      pool,
      serverId,
      channelId,
    );
    assert.equal(rowsAfterRename.length, 1);
    assert.equal(rowsAfterRename[0]?.partial.EMBED_LINKS, false);

    await ensureEchoTables(pool);

    const rowsAfterSchemaEnsure = await listEchoChannelPermissionOverwrites(
      pool,
      serverId,
      channelId,
    );
    assert.equal(rowsAfterSchemaEnsure.length, 1);
    assert.equal(rowsAfterSchemaEnsure[0]?.partial.EMBED_LINKS, false);

    console.log('echo.channelPermissionPersistence: ok');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
