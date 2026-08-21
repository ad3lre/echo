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
  try {
    await client.query('BEGIN');

    const serverId = 'itest_s1';
    const userId = 'itest_u1';
    const channelId = 'itest_ch1';
    const categoryId = 'itest_cat_a';

    // Minimal server + roles + member assignment + category + channel
    await client.query(
      `INSERT INTO echo_servers (id, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [serverId, 'owner_x'],
    );

    await client.query(
      `INSERT INTO echo_roles (id, server_id, name, position, permissions) VALUES
      ($1, $2, $3, $4, $5), ($6, $2, $7, $8, $9)
      ON CONFLICT DO NOTHING`,
      [
        'itest_r_everyone',
        serverId,
        '@everyone',
        0,
        JSON.stringify(['VIEW_CHANNEL', 'SEND_MESSAGE']),
        'itest_r_mod',
        'moderator',
        1,
        JSON.stringify(['MODERATE_MEMBERS']),
      ],
    );

    await client.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [serverId, userId, 'itest_r_mod'],
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
      'owner_x',
      channelId,
    );
    assert.ok(ownerRes.ownerBypass, 'owner should bypass');
    assert.ok(
      ownerRes.effective.has('ADMINISTRATOR'),
      'owner should have all perms',
    );

    // Test administrator bypass of layers
    const adminUserId = 'itest_u_admin';
    await client.query(
      `INSERT INTO echo_roles (id, server_id, name, position, permissions) VALUES ($1, $2, $3, $4, $5)`,
      [
        'itest_r_admin',
        serverId,
        'admin',
        2,
        JSON.stringify(['ADMINISTRATOR']),
      ],
    );
    await client.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [serverId, adminUserId, 'itest_r_admin'],
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
    await client.query('ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
