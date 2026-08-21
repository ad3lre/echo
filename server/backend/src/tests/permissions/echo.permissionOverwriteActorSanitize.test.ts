import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  createEchoChannel,
  createEchoServer,
  listEchoChannelPermissionOverwrites,
  permissionOverwriteSaveWarnings,
  replaceEchoChannelPermissionOverwrites,
} from '../../domain/echoStore';
import {
  assignEchoMemberRole,
  createEchoRole,
} from '../../domain/echoStore/roles/roles';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `pows_${id.replace(/[^a-z0-9]/gi, '')}`.slice(0, 32);
  const email = `${username}@pows.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Overwrite sanitize test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.permissionOverwriteActorSanitize: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const token = Date.now().toString(36);
  const ownerId = `pows_owner_${token}`;
  const modId = `pows_mod_${token}`;

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, modId);

    const created = await createEchoServer(pool, ownerId, 'pows-test');
    const serverId = created.serverId;

    const categoryRes = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
      [serverId],
    );
    const categoryId = String(categoryRes.rows[0]!.id);

    const channelId = await createEchoChannel(
      pool,
      serverId,
      'pows-ch',
      'text',
      categoryId,
    );
    if (channelId === 'invalid_category') assert.fail('expected channel');

    await pool.query(
      `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [serverId, modId],
    );

    const modRoleCreated = await createEchoRole(pool, serverId, ownerId, {
      name: 'Moderator',
      permissions: ['MANAGE_CHANNELS', 'MANAGE_ROLES'],
    });
    if (typeof modRoleCreated !== 'object' || !('roleId' in modRoleCreated)) {
      assert.fail(`expected mod role id, got ${String(modRoleCreated)}`);
    }
    const assignResult = await assignEchoMemberRole(
      pool,
      serverId,
      ownerId,
      modId,
      modRoleCreated.roleId,
    );
    assert.equal(assignResult, 'ok');

    const saveResult = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      modId,
      channelId,
      [
        {
          targetType: 'everyone',
          partial: {
            EMBED_LINKS: false,
            MANAGE_WEBHOOKS: true,
          },
        },
      ],
    );

    const warnings = permissionOverwriteSaveWarnings(saveResult);
    assert.ok(warnings?.strippedAllows?.includes('MANAGE_WEBHOOKS'));

    const rows = await listEchoChannelPermissionOverwrites(
      pool,
      serverId,
      channelId,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.partial.EMBED_LINKS, false);
    assert.equal(rows[0]?.partial.MANAGE_WEBHOOKS, undefined);

    console.log('echo.permissionOverwriteActorSanitize: ok');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
