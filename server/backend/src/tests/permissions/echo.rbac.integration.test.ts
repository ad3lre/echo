import assert from 'node:assert/strict';
import pg from 'pg';
import { evaluatePermissionSet } from '../../domain/permissions/echoPermissionEvaluate';

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping integration test: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  let cleanupServerId = '';
  const cleanupUserIds: string[] = [];
  try {
    await client.query('BEGIN');

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const serverId = (cleanupServerId = `itest_s_${suffix}`);
    const userId = `itest_u_${suffix}`;
    const channelId = `itest_ch_${suffix}`;
    const categoryId = `itest_cat_${suffix}`;
    const ownerId = `itest_owner_${suffix}`;
    const everyoneRoleId = `itest_r_everyone_${suffix}`;
    const modRoleId = `itest_r_mod_${suffix}`;
    cleanupUserIds.push(ownerId, userId);

    await client.query(
      `INSERT INTO auth_users (id, username) VALUES ($1, $2), ($3, $4)`,
      [ownerId, `${ownerId}_name`, userId, `${userId}_name`],
    );

    // Minimal server + roles + member assignment + category + channel
    await client.query(
      `INSERT INTO echo_servers (id, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [serverId, ownerId],
    );

    await client.query(
      `INSERT INTO echo_roles (id, server_id, name, position, permissions) VALUES
      ($1, $2, $3, $4, $5), ($6, $2, $7, $8, $9)
      ON CONFLICT DO NOTHING`,
      [
        everyoneRoleId,
        serverId,
        '@everyone',
        0,
        JSON.stringify(['VIEW_CHANNEL', 'SEND_MESSAGE']),
        modRoleId,
        'moderator',
        1,
        JSON.stringify(['MODERATE_MEMBERS']),
      ],
    );

    await client.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [serverId, userId, modRoleId],
    );

    await client.query(
      `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING`,
      [categoryId, serverId, 'catA', 0],
    );

    await client.query(
      `INSERT INTO echo_channels (id, server_id, name, type, category_id, permission_overrides) VALUES ($1, $2, $3, 'text', $4, $5)
      ON CONFLICT (id) DO UPDATE SET permission_overrides = EXCLUDED.permission_overrides`,
      [
        channelId,
        serverId,
        'channel-1',
        categoryId,
        JSON.stringify({ MANAGE_MESSAGES: true }),
      ],
    );

    await client.query(
      `INSERT INTO echo_category_permission_overrides (server_id, category_id, permission_overrides) VALUES ($1, $2, $3)
      ON CONFLICT (server_id, category_id) DO UPDATE SET permission_overrides = EXCLUDED.permission_overrides`,
      [serverId, categoryId, JSON.stringify({ VIEW_CHANNEL: false })],
    );

    // Permission evaluation uses the pool, so the fixture must be committed
    // before those reads can observe it. The unique test server is removed below.
    await client.query('COMMIT');

    const res = await evaluatePermissionSet(pool, serverId, userId, channelId, {
      traceMode: 'compressed',
    });
    // Expect moderator role permission and channel override applied
    assert.ok(
      res.effective.has('MODERATE_MEMBERS'),
      'missing MODERATE_MEMBERS',
    );
    assert.ok(res.effective.has('MANAGE_MESSAGES'), 'missing MANAGE_MESSAGES');
    // VIEW_CHANNEL should not be present because category override removed it and moderator role doesn't grant it
    assert.ok(
      !res.effective.has('VIEW_CHANNEL'),
      'VIEW_CHANNEL should be removed by category override',
    );

    // Test owner bypass
    const ownerRes = await evaluatePermissionSet(
      pool,
      serverId,
      ownerId,
      channelId,
    );
    assert.ok(ownerRes.ownerBypass, 'owner should bypass');
    assert.ok(
      ownerRes.effective.has('ADMINISTRATOR'),
      'owner should have all perms',
    );

    // Test administrator bypass of layers
    const adminUserId = `itest_u_admin_${suffix}`;
    cleanupUserIds.push(adminUserId);
    await client.query(
      `INSERT INTO auth_users (id, username) VALUES ($1, $2)`,
      [adminUserId, `${adminUserId}_name`],
    );
    await client.query(
      `INSERT INTO echo_roles (id, server_id, name, position, permissions) VALUES ($1, $2, $3, $4, $5)`,
      [
        `itest_r_admin_${suffix}`,
        serverId,
        'admin',
        2,
        JSON.stringify(['ADMINISTRATOR']),
      ],
    );
    await client.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [serverId, adminUserId, `itest_r_admin_${suffix}`],
    );
    const adminRes = await evaluatePermissionSet(
      pool,
      serverId,
      adminUserId,
      channelId,
    );
    assert.ok(
      adminRes.effective.has('VIEW_CHANNEL'),
      'admin should bypass category deny',
    );

    console.log('echo.rbac.integration: ok');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (cleanupServerId)
      await pool
        .query(`DELETE FROM echo_servers WHERE id = $1`, [cleanupServerId])
        .catch(() => undefined);
    if (cleanupUserIds.length > 0)
      await pool
        .query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
          cleanupUserIds,
        ])
        .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
