import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  applyEchoModerationAction,
  canActorSetTargetNickname,
  canUserAddMessageReaction,
  canUserCreateInvite,
  createEchoChannel,
  createEchoServer,
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
  getUserCommunicationTimeoutState,
  joinEchoVoiceChannel,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `timeout_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  const email = `${username}@timeout.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, username, passwordHash],
  );
}

async function grantTestPermissions(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_roles
    SET permissions = permissions || $2::jsonb
    WHERE server_id = $1 AND name = '@everyone'
    `,
    [
      serverId,
      JSON.stringify([
        'MANAGE_CHANNELS',
        'CHANGE_NICKNAME',
        'SEND_POLLS',
        'ATTACH_FILES',
        'USE_EXTERNAL_EMOJIS',
        'PIN_MESSAGES',
      ]),
    ],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.timeoutParity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `timeout_owner_${Date.now().toString(36)}`;
  const memberId = `timeout_member_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);

    const created = await createEchoServer(
      pool,
      ownerId,
      'timeout-parity-test',
    );
    serverId = created.serverId;
    await addEchoServerMember(pool, serverId, memberId);
    await grantTestPermissions(pool, serverId);

    const cat = await pool.query<{ id: string }>(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC, id ASC LIMIT 1`,
      [serverId],
    );
    const categoryId = String(cat.rows[0]?.id ?? '');
    assert.ok(categoryId, 'expected server category to exist');

    const voiceChannelId = await createEchoChannel(
      pool,
      serverId,
      'voice-timeout',
      'voice',
      categoryId,
    );
    assert.notEqual(voiceChannelId, 'invalid_category');

    const beforeChannelCaps = await getEchoChannelCapabilitiesForUser(
      pool,
      created.defaultChannelId,
      memberId,
    );
    assert.equal(beforeChannelCaps.communicationTimeoutActive, false);
    assert.equal(beforeChannelCaps.canSendMessages, true);
    assert.equal(beforeChannelCaps.canCreatePolls, true);
    assert.equal(beforeChannelCaps.canUploadFiles, true);

    const beforeServerCaps = await getEchoServerCapabilitiesForUser(
      pool,
      serverId,
      memberId,
    );
    assert.equal(beforeServerCaps.communicationTimeoutActive, false);
    assert.equal(beforeServerCaps.canCreateInvite, true);
    assert.equal(beforeServerCaps.canCreateChannel, true);
    assert.equal(beforeServerCaps.canChangeNicknames, true);

    assert.equal(
      await canUserAddMessageReaction(pool, memberId, created.defaultChannelId),
      true,
    );
    assert.equal(await canUserCreateInvite(pool, serverId, memberId), true);
    assert.equal(
      await canActorSetTargetNickname(pool, serverId, memberId, memberId),
      true,
    );
    assert.deepEqual(
      await joinEchoVoiceChannel(
        pool,
        serverId,
        String(voiceChannelId),
        memberId,
      ),
      { ok: true },
    );

    await applyEchoModerationAction(
      pool,
      serverId,
      ownerId,
      'timeout',
      memberId,
      { timeoutMinutes: 60 },
    );

    const timeoutState = await getUserCommunicationTimeoutState(
      pool,
      serverId,
      memberId,
    );
    assert.equal(timeoutState.active, true);
    assert.ok(timeoutState.timeoutUntil);
    assert.ok(timeoutState.timeoutUntilEpochMs);

    const afterChannelCaps = await getEchoChannelCapabilitiesForUser(
      pool,
      created.defaultChannelId,
      memberId,
    );
    assert.equal(afterChannelCaps.communicationTimeoutActive, true);
    assert.equal(afterChannelCaps.canSendMessages, false);
    assert.equal(afterChannelCaps.canCreatePolls, false);
    assert.equal(afterChannelCaps.canUploadFiles, false);

    const afterServerCaps = await getEchoServerCapabilitiesForUser(
      pool,
      serverId,
      memberId,
    );
    assert.equal(afterServerCaps.communicationTimeoutActive, true);
    assert.equal(afterServerCaps.canCreateInvite, false);
    assert.equal(afterServerCaps.canCreateChannel, false);
    assert.equal(afterServerCaps.canChangeNicknames, false);

    assert.equal(
      await canUserAddMessageReaction(pool, memberId, created.defaultChannelId),
      false,
    );
    assert.equal(await canUserCreateInvite(pool, serverId, memberId), false);
    assert.equal(
      await canActorSetTargetNickname(pool, serverId, memberId, memberId),
      false,
    );
    assert.deepEqual(
      await joinEchoVoiceChannel(
        pool,
        serverId,
        String(voiceChannelId),
        memberId,
      ),
      { ok: false, reason: 'timeout' },
    );

    await applyEchoModerationAction(
      pool,
      serverId,
      ownerId,
      'untimeout',
      memberId,
      {},
    );

    const clearedTimeoutState = await getUserCommunicationTimeoutState(
      pool,
      serverId,
      memberId,
    );
    assert.equal(clearedTimeoutState.active, false);
    assert.equal(clearedTimeoutState.timeoutUntil, null);

    const restoredChannelCaps = await getEchoChannelCapabilitiesForUser(
      pool,
      created.defaultChannelId,
      memberId,
    );
    assert.equal(restoredChannelCaps.communicationTimeoutActive, false);
    assert.equal(restoredChannelCaps.canSendMessages, true);

    const restoredServerCaps = await getEchoServerCapabilitiesForUser(
      pool,
      serverId,
      memberId,
    );
    assert.equal(restoredServerCaps.communicationTimeoutActive, false);
    assert.equal(restoredServerCaps.canCreateInvite, true);
    assert.equal(restoredServerCaps.canCreateChannel, true);

    assert.deepEqual(
      await joinEchoVoiceChannel(
        pool,
        serverId,
        String(voiceChannelId),
        memberId,
      ),
      { ok: true },
    );

    console.log('echo.timeoutParity: ok');
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
