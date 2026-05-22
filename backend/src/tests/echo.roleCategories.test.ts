import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  createEchoRole,
  createEchoRoleCategory,
  createEchoServer,
  deleteEchoRoleCategory,
  listEchoRoleCategories,
  listEchoRolesForServer,
} from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `rcat_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@role-categories.echo.test`;
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
      'Skipping echo.roleCategories: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `rcat_owner_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);

    const created = await createEchoServer(pool, ownerId, 'role-cat-test');
    serverId = created.serverId;
    await grantManageRolesToEveryone(pool, serverId);

    const catRes = await createEchoRoleCategory(
      pool,
      serverId,
      ownerId,
      'Staff',
    );
    assert.ok(catRes !== 'forbidden' && catRes !== 'invalid_body');
    const categoryId =
      typeof catRes === 'object' && catRes.ok === true ? catRes.id : '';
    assert.ok(categoryId, 'Expected category id');

    const listed = await listEchoRoleCategories(pool, serverId);
    const staff = listed.find((c) => c.id === categoryId);
    assert.ok(staff);
    assert.equal(staff!.name, 'Staff');

    const newRole = await createEchoRole(pool, serverId, ownerId, {
      name: 'Support',
      color: '',
      permissions: [],
      roleCategoryId: categoryId,
    });
    assert.ok(
      newRole !== 'invalid_body' &&
        newRole !== 'forbidden' &&
        newRole !== 'limit_reached',
    );
    const roleId =
      typeof newRole === 'object' && 'roleId' in newRole ? newRole.roleId : '';
    assert.ok(roleId);

    const roles = await listEchoRolesForServer(pool, serverId);
    const support = roles.find((r) => r.id === roleId);
    assert.ok(support);
    assert.equal(support!.roleCategoryId, categoryId);

    const del = await deleteEchoRoleCategory(
      pool,
      serverId,
      ownerId,
      categoryId,
    );
    assert.equal(del, 'ok');

    const rolesAfter = await listEchoRolesForServer(pool, serverId);
    const supportAfter = rolesAfter.find((r) => r.id === roleId);
    assert.ok(supportAfter);
    assert.ok(supportAfter!.roleCategoryId);

    const catsAfter = await listEchoRoleCategories(pool, serverId);
    assert.equal(
      catsAfter.some((c) => c.id === categoryId),
      false,
    );

    const globalAfter = catsAfter.find((c) => c.isSystem);
    assert.ok(globalAfter);
    const supportAfterGlobal = rolesAfter.find((r) => r.id === roleId);
    assert.equal(supportAfterGlobal!.roleCategoryId, globalAfter!.id);

    console.log('echo.roleCategories: ok');
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
