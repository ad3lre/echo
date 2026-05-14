import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  addEchoServerMember,
  createEchoServer,
  listEchoMemberRoleAssignmentsByUser,
  listEchoRolesForServer,
  updateEchoRole,
} from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `drole_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@default-role.echo.test`;
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
      'Skipping echo.defaultRole: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `drole_owner_${Date.now().toString(36)}`;
  const memberId = `drole_member_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);

    const created = await createEchoServer(pool, ownerId, 'default-role-test');
    serverId = created.serverId;

    await grantManageRolesToEveryone(pool, serverId);

    const roles = await listEchoRolesForServer(pool, serverId);
    const memberRole = roles.find((r) => r.name === 'Moderator');
    assert.ok(memberRole, 'Expected seeded Moderator role to exist');

    const markDefault = await updateEchoRole(
      pool,
      serverId,
      ownerId,
      memberRole!.id,
      { defaultOnJoin: true },
    );
    assert.equal(markDefault, 'ok');

    await addEchoServerMember(pool, serverId, memberId);
    const assignments = await listEchoMemberRoleAssignmentsByUser(
      pool,
      serverId,
    );
    const memberRoleIds = new Set(assignments[memberId] ?? []);

    const everyoneRole = roles.find((r) => r.name === '@everyone');
    assert.ok(everyoneRole, 'Expected @everyone role to exist');
    assert.equal(memberRoleIds.has(everyoneRole!.id), true);
    assert.equal(memberRoleIds.has(memberRole!.id), true);

    console.log('echo.defaultRole: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, memberId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
