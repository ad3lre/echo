import assert from 'node:assert/strict';
import pg from 'pg';
import { makeHash } from '../../auth/store/helpers';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  assignEchoMemberRole,
  createEchoRole,
  createEchoServer,
} from '../echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await makeHash('pw');
  const username = `grs_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, `${username}@grant-set.echo.test`, username, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('Skipping echo.assignRoleGrantSet: PG_TEST_URL not set');
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const sfx = Date.now().toString(36);
  const ownerId = `grs_owner_${sfx}`;
  const actorId = `grs_actor_${sfx}`;
  const targetId = `grs_target_${sfx}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    for (const id of [ownerId, actorId, targetId]) {
      await insertAuthUser(pool, id);
    }
    serverId = (await createEchoServer(pool, ownerId, 'grant-set-test'))
      .serverId;
    await addEchoServerMember(pool, serverId, actorId);
    await addEchoServerMember(pool, serverId, targetId);

    const mk = async (name: string, permissions: string[]): Promise<string> => {
      const res = await createEchoRole(pool, serverId, ownerId, {
        name,
        color: '',
        permissions,
      });
      assert.ok(typeof res === 'object' && 'roleId' in res);
      return res.roleId;
    };
    const modRole = await mk('Mod', ['MANAGE_ROLES', 'VIEW_CHANNEL']);
    const bigRole = await mk('Big', ['MANAGE_GUILD', 'VIEW_CHANNEL']);
    const smallRole = await mk('Small', ['VIEW_CHANNEL']);
    // createEchoRole renormalizes positions and defaults to category scope, so
    // pin a global hierarchy only after every role exists (Mod outranks the rest);
    // that way the grant-set guard, not the hierarchy check, decides the result.
    for (const [roleId, position] of [
      [modRole, 50],
      [bigRole, 10],
      [smallRole, 5],
    ] as const) {
      await pool.query(
        `UPDATE echo_roles SET position = $1, role_scope = 'global' WHERE id = $2`,
        [position, roleId],
      );
    }
    assert.equal(
      await assignEchoMemberRole(pool, serverId, ownerId, actorId, modRole),
      'ok',
    );

    // Actor lacks MANAGE_GUILD: must not hand it to another user (or self).
    assert.equal(
      await assignEchoMemberRole(pool, serverId, actorId, targetId, bigRole),
      'forbidden',
    );
    assert.equal(
      await assignEchoMemberRole(pool, serverId, actorId, actorId, bigRole),
      'forbidden',
    );
    // Subset grant to another user still works.
    assert.equal(
      await assignEchoMemberRole(pool, serverId, actorId, targetId, smallRole),
      'ok',
    );
    console.log('echo.assignRoleGrantSet.test.ts OK');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1)`, [
      [ownerId, actorId, targetId],
    ]);
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
