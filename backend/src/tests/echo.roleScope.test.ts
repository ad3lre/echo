import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  assignEchoMemberRole,
  createEchoRole,
  createEchoRoleCategory,
  createEchoServer,
  listEchoRolesForServer,
  updateEchoRole,
} from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `rscope_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@role-scope.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, username, passwordHash],
  );
}

async function grantPermsToRole(
  pool: pg.Pool,
  serverId: string,
  roleId: string,
  perms: string[],
): Promise<void> {
  await pool.query(
    `UPDATE echo_roles SET permissions = $3::jsonb WHERE server_id = $1 AND id = $2`,
    [serverId, roleId, JSON.stringify(perms)],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('Skipping echo.roleScope: PG_TEST_URL / DATABASE_URL not set');
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `rscope_owner_${Date.now().toString(36)}`;
  const modId = `rscope_mod_${Date.now().toString(36)}`;
  const targetId = `rscope_target_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, modId);
    await insertAuthUser(pool, targetId);

    const created = await createEchoServer(pool, ownerId, 'role-scope-test');
    serverId = created.serverId;

    const gameCat = await createEchoRoleCategory(
      pool,
      serverId,
      ownerId,
      'Game 1',
    );
    assert.ok(typeof gameCat === 'object' && gameCat.ok);
    const gameCatId =
      typeof gameCat === 'object' && gameCat.ok ? gameCat.id : '';

    const globalAdmin = await createEchoRole(pool, serverId, ownerId, {
      name: 'GlobalAdmin',
      color: '',
      permissions: ['MANAGE_ROLES'],
      roleScope: 'global',
    });
    assert.ok(typeof globalAdmin === 'object' && 'roleId' in globalAdmin);

    const gamePlayer = await createEchoRole(pool, serverId, ownerId, {
      name: 'Player',
      color: '',
      permissions: [],
      roleCategoryId: gameCatId,
    });
    assert.ok(typeof gamePlayer === 'object' && 'roleId' in gamePlayer);

    const gameMod = await createEchoRole(pool, serverId, ownerId, {
      name: 'GameMod',
      color: '',
      permissions: ['ASSIGN_ROLES'],
      roleCategoryId: gameCatId,
      roleScope: 'category',
    });
    assert.ok(typeof gameMod === 'object' && 'roleId' in gameMod);
    const gameModId =
      typeof gameMod === 'object' && 'roleId' in gameMod ? gameMod.roleId : '';
    const playerId =
      typeof gamePlayer === 'object' && 'roleId' in gamePlayer
        ? gamePlayer.roleId
        : '';

    const globalMember = await createEchoRole(pool, serverId, ownerId, {
      name: 'GlobalMember',
      color: '',
      permissions: [],
    });
    const globalMemberId =
      typeof globalMember === 'object' && 'roleId' in globalMember
        ? globalMember.roleId
        : '';

    await pool.query(
      `
      INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2), ($1, $3)
      ON CONFLICT DO NOTHING
      `,
      [serverId, modId, targetId],
    );

    const modRoleAssign = await assignEchoMemberRole(
      pool,
      serverId,
      ownerId,
      modId,
      gameModId,
    );
    assert.equal(modRoleAssign, 'ok');

    const assignGame = await assignEchoMemberRole(
      pool,
      serverId,
      modId,
      targetId,
      playerId,
    );
    assert.equal(assignGame, 'ok');

    const assignGlobalBlocked = await assignEchoMemberRole(
      pool,
      serverId,
      modId,
      targetId,
      globalMemberId,
    );
    assert.equal(assignGlobalBlocked, 'forbidden');

    const upd = await updateEchoRole(pool, serverId, modId, globalMemberId, {
      name: 'GlobalMember2',
    });
    assert.equal(upd, 'forbidden');

    console.log('echo.roleScope: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, modId, targetId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
