import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  createEchoRole,
  createEchoRoleCategory,
  createEchoServer,
  getEchoSelfRolesConfig,
  resolveEchoSelfRolesPanel,
  toggleSelfAssignableMemberRole,
  updateEchoSelfRolesConfig,
} from '../domain/echoStore';
import { updateEchoRoleCategory } from '../domain/echoStore/roleCategories';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `sar_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@self-roles.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, username, passwordHash],
  );
}

async function grantManageRolesToEveryone(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_roles
    SET permissions = permissions || '["MANAGE_ROLES"]'::jsonb
    WHERE server_id = $1 AND name = '@everyone'
    `,
    [serverId],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.selfAssignableRoles: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `sar_owner_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    const created = await createEchoServer(pool, ownerId, 'self-roles-test');
    serverId = created.serverId;
    await grantManageRolesToEveryone(pool, serverId);

    const catRes = await createEchoRoleCategory(
      pool,
      serverId,
      ownerId,
      'Games',
    );
    assert.ok(typeof catRes === 'object' && catRes.ok === true);
    const categoryId = catRes.id;

    await updateEchoRoleCategory(pool, serverId, ownerId, categoryId, {
      selfAssignableDefaults: true,
    });

    const gamerRes = await createEchoRole(pool, serverId, ownerId, {
      name: 'Gamer',
      color: '',
      permissions: ['SELF_SELECTABLE', 'VIEW_CHANNEL', 'SEND_MESSAGES'],
      roleCategoryId: categoryId,
    });
    assert.ok(
      gamerRes !== 'invalid_body' &&
        gamerRes !== 'forbidden' &&
        gamerRes !== 'limit_reached',
    );
    const gamerId =
      typeof gamerRes === 'object' && 'roleId' in gamerRes
        ? gamerRes.roleId
        : '';
    assert.ok(gamerId);

    await updateEchoSelfRolesConfig(pool, serverId, {
      enabled: true,
      channelName: 'pick-roles',
      customCategories: [],
    });

    const config = await getEchoSelfRolesConfig(pool, serverId);
    assert.ok(config.panelChannelId);
    const ch = await pool.query<{ type: string; name: string }>(
      `SELECT type, name FROM echo_channels WHERE id = $1 AND server_id = $2`,
      [config.panelChannelId, serverId],
    );
    assert.equal(ch.rows.length, 1);
    assert.equal(ch.rows[0]!.type, 'selfRoles');
    assert.equal(ch.rows[0]!.name, 'pick-roles');
    assert.equal(config.channelName, 'pick-roles');

    let panel = await resolveEchoSelfRolesPanel(pool, serverId, ownerId);
    assert.equal(panel.categories.length, 1);
    assert.equal(panel.categories[0]!.source, 'derived');
    assert.ok(panel.categories[0]!.roles.some((r) => r.id === gamerId));

    const toggle = await toggleSelfAssignableMemberRole(
      pool,
      serverId,
      ownerId,
      gamerId,
      true,
    );
    assert.equal(toggle, 'ok');

    panel = await resolveEchoSelfRolesPanel(pool, serverId, ownerId);
    assert.ok(panel.assignedRoleIds.includes(gamerId));

    const remove = await toggleSelfAssignableMemberRole(
      pool,
      serverId,
      ownerId,
      gamerId,
      false,
    );
    assert.equal(remove, 'ok');
    panel = await resolveEchoSelfRolesPanel(pool, serverId, ownerId);
    assert.ok(!panel.assignedRoleIds.includes(gamerId));

    console.log('echo.selfAssignableRoles.test.ts OK');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
