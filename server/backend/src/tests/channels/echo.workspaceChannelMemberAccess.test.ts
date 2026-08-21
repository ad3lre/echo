import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  assignEchoMemberRole,
  createEchoChannel,
  createEchoRole,
  createEchoServer,
  listEchoWorkspaceForUser,
  replaceEchoChannelPermissionOverwrites,
} from '../../domain/echoStore';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `wch_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@workspace-channel.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, displayName, passwordHash],
  );
}

function findWorkspaceChannel(
  workspace: Awaited<ReturnType<typeof listEchoWorkspaceForUser>>,
  serverId: string,
  channelId: string,
): { id: string; accessibleMemberUserIds?: string[] } | undefined {
  return workspace.categoriesByServer[serverId]
    ?.flatMap((category) => category.channels)
    .find((channel) => (channel as { id?: string }).id === channelId) as
    | { id: string; accessibleMemberUserIds?: string[] }
    | undefined;
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.workspaceChannelMemberAccess: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const token = Date.now().toString(36);
  const ownerId = `wch_owner_${token}`;
  const privilegedMemberId = `wch_priv_${token}`;
  const hiddenMemberId = `wch_hidden_${token}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId, 'Workspace Owner');
    await insertAuthUser(pool, privilegedMemberId, 'Privileged Member');
    await insertAuthUser(pool, hiddenMemberId, 'Hidden Member');

    const created = await createEchoServer(pool, ownerId, 'wch-test');
    serverId = created.serverId;

    await addEchoServerMember(pool, serverId, privilegedMemberId);
    await addEchoServerMember(pool, serverId, hiddenMemberId);

    const categoryRes = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
      [serverId],
    );
    const categoryId = String(categoryRes.rows[0]!.id);
    const privateChannelId = await createEchoChannel(
      pool,
      serverId,
      'private-room',
      'text',
      categoryId,
    );
    if (privateChannelId === 'invalid_category') {
      assert.fail('expected valid private text channel category');
    }

    const createdRole = await createEchoRole(pool, serverId, ownerId, {
      name: 'Private Room',
      permissions: ['VIEW_CHANNEL'],
      hoist: true,
    });
    if (
      createdRole === 'forbidden' ||
      createdRole === 'invalid_body' ||
      createdRole === 'limit_reached'
    ) {
      assert.fail(
        `expected private-room role creation to succeed, got ${createdRole}`,
      );
    }

    const assignResult = await assignEchoMemberRole(
      pool,
      serverId,
      ownerId,
      privilegedMemberId,
      createdRole.roleId,
    );
    assert.equal(assignResult, 'ok');

    const overwriteResult = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      privateChannelId,
      [
        { targetType: 'everyone', partial: { VIEW_CHANNEL: false } },
        {
          targetType: 'role',
          targetId: createdRole.roleId,
          partial: { VIEW_CHANNEL: true },
        },
      ],
    );
    assert.equal(overwriteResult, 'ok');

    const ownerWorkspace = await listEchoWorkspaceForUser(pool, ownerId);
    const privateChannelForOwner = findWorkspaceChannel(
      ownerWorkspace,
      serverId,
      privateChannelId,
    );
    assert.ok(
      privateChannelForOwner,
      'owner workspace should include the hidden channel',
    );
    const accessibleMemberUserIds = [
      ...(privateChannelForOwner?.accessibleMemberUserIds ?? []),
    ].sort();
    assert.deepEqual(
      accessibleMemberUserIds,
      [ownerId, privilegedMemberId].sort(),
    );

    const hiddenMemberWorkspace = await listEchoWorkspaceForUser(
      pool,
      hiddenMemberId,
    );
    const privateChannelForHiddenMember = findWorkspaceChannel(
      hiddenMemberWorkspace,
      serverId,
      privateChannelId,
    );
    assert.equal(
      privateChannelForHiddenMember,
      undefined,
      'member without VIEW_CHANNEL should not receive the hidden channel in workspace',
    );

    console.log('echo.workspaceChannelMemberAccess: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, privilegedMemberId, hiddenMemberId],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
