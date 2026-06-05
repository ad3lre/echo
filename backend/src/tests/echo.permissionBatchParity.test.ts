import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  addEchoServerMember,
  assignEchoMemberRole,
  canUserSendMassMentionInChannel,
  createEchoServer,
  createEchoRole,
  getEffectiveChannelPermissions,
} from '../domain/echoStore';
import { invalidateEchoPermissionCacheForServer } from '../domain/echoPermissionCache';
import { batchGetEffectiveChannelPermissions } from '../domain/echoStore/permissions';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `bp_${id.replace(/[^a-z0-9]/gi, '').slice(0, 18)}`;
  const email = `${username}@batch-parity.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, username, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.permissionBatchParity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `bp_owner_${Date.now().toString(36)}`;
  const memberId = `bp_member_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);

    const created = await createEchoServer(pool, ownerId, 'batch-perm-parity');
    serverId = created.serverId;
    await addEchoServerMember(pool, serverId, memberId);

    const visualRole = await createEchoRole(pool, serverId, ownerId, {
      name: 'Mentionable Visual',
      color: '',
      permissions: ['MENTION_EVERYONE'],
      roleType: 'visual',
    });
    assert.ok(typeof visualRole === 'object' && 'roleId' in visualRole);
    assert.equal(
      await assignEchoMemberRole(
        pool,
        serverId,
        ownerId,
        memberId,
        visualRole.roleId,
      ),
      'ok',
    );

    await invalidateEchoPermissionCacheForServer(pool, serverId);

    const channelId = created.defaultChannelId;
    const mentions = [{ id: 'm1', kind: 'everyone' as const }];

    const single = await getEffectiveChannelPermissions(
      pool,
      serverId,
      memberId,
      channelId,
    );
    const batchMap = await batchGetEffectiveChannelPermissions(
      pool,
      serverId,
      memberId,
      [channelId],
    );
    const batch = batchMap.get(channelId);

    assert.ok(single && batch, 'expected permission sets');
    assert.deepEqual(
      [...batch!].sort(),
      [...single!].sort(),
      'batch and single evaluators must match (visual roles excluded)',
    );
    assert.equal(
      single.has('MENTION_EVERYONE'),
      false,
      'visual role must not grant MENTION_EVERYONE in effective perms',
    );
    assert.equal(
      await canUserSendMassMentionInChannel(
        pool,
        memberId,
        channelId,
        mentions,
      ),
      false,
    );

    // Unknown / cross-server channel id: both evaluators must fail closed
    // (empty set), not fall through to server-baseline perms.
    const missingChannelId = `bp_missing_${Date.now().toString(36)}`;
    const singleMissing = await getEffectiveChannelPermissions(
      pool,
      serverId,
      memberId,
      missingChannelId,
    );
    const batchMissing = (
      await batchGetEffectiveChannelPermissions(pool, serverId, memberId, [
        missingChannelId,
      ])
    ).get(missingChannelId);
    assert.ok(batchMissing, 'expected a batch entry for the missing channel');
    assert.deepEqual(
      [...singleMissing].sort(),
      [...batchMissing!].sort(),
      'single and batch must agree for an unknown channel id',
    );
    assert.equal(
      singleMissing.size,
      0,
      'unknown channel must yield no permissions (fail closed)',
    );

    console.log('echo.permissionBatchParity: ok');
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
