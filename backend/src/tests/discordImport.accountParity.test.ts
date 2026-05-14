import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { DISCORD_ECHO_PERMISSION_STRINGS } from '../../../shared/discordEchoPermissions';

const DISCORD_PERMISSION_BIT_POSITIONS = DISCORD_ECHO_PERMISSION_STRINGS.map(
  (_: string, index: number) => (index < 47 ? index : index + 2),
);

function permissionBits(names: string[]): string {
  let out = 0n;
  for (const name of names) {
    const index = DISCORD_ECHO_PERMISSION_STRINGS.indexOf(
      name as (typeof DISCORD_ECHO_PERMISSION_STRINGS)[number],
    );
    if (index < 0) continue;
    out |= 1n << BigInt(DISCORD_PERMISSION_BIT_POSITIONS[index]!);
  }
  return out.toString();
}

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  label: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `${label}_${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const email = `${username}@echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, label, passwordHash],
  );
}

async function writeBundle(
  tempRoot: string,
  importedRoleName: string,
): Promise<void> {
  await mkdir(path.join(tempRoot, 'assets', 'emojis'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'assets', 'guild_icon.png'),
    Buffer.from('icon-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'manifest.json'),
    JSON.stringify({
      guildId: 'discord-guild-1',
      guildName: 'Parity Import',
      completeness: {
        echoCoreOk: true,
        warnings: [],
      },
    }),
  );
  await writeFile(
    path.join(tempRoot, 'guild.json'),
    JSON.stringify({
      id: 'discord-guild-1',
      name: 'Parity Import',
      description: 'Parity import test bundle',
    }),
  );
  await writeFile(
    path.join(tempRoot, 'asset_manifest.json'),
    JSON.stringify({
      guildIcon: 'assets/guild_icon.png',
      emojis: {
        'emoji-joy': 'assets/emojis/Joy_emoji-joy.png',
      },
      stickers: {},
      roleIcons: {},
      errors: [],
    }),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'emojis', 'Joy_emoji-joy.png'),
    Buffer.from('emoji-joy-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'emojis.json'),
    JSON.stringify([
      {
        id: 'emoji-joy',
        name: 'Joy',
        animated: false,
      },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'roles.json'),
    JSON.stringify([
      {
        id: 'role-mod',
        name: importedRoleName,
        permissions: permissionBits([
          'VIEW_CHANNEL',
          'SEND_MESSAGES',
          'MANAGE_MESSAGES',
        ]),
        color: 0xff0000,
        hoist: true,
      },
      {
        id: 'discord-guild-1',
        name: '@everyone',
        permissions: permissionBits(['VIEW_CHANNEL']),
        color: 0x99aab5,
        hoist: false,
      },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'channels.json'),
    JSON.stringify([
      { id: 'cat-general', type: 4, name: 'General', position: 0 },
      {
        id: 'ch-chat',
        type: 0,
        name: 'chat',
        parent_id: 'cat-general',
        position: 0,
        nsfw: false,
      },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'overwrites.jsonl'),
    [
      JSON.stringify({
        channelId: 'ch-chat',
        id: 'member-user',
        type: 1,
        allow: permissionBits(['SEND_MESSAGES']),
        deny: '0',
      }),
    ].join('\n'),
  );
  await writeFile(
    path.join(tempRoot, 'members.jsonl'),
    `${JSON.stringify({
      user: { id: 'member-user', username: 'memuser', avatar: null },
      roles: ['discord-guild-1', 'role-mod'],
    })}\n`,
  );
}

function expectCreatedRole(
  value: { roleId: string } | 'forbidden' | 'invalid_body' | 'limit_reached',
): { roleId: string } {
  if (
    value === 'forbidden' ||
    value === 'invalid_body' ||
    value === 'limit_reached'
  ) {
    assert.fail(`expected role creation to succeed, got ${value}`);
  }
  return value;
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping discordImport.accountParity.test.ts: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'echo-discord-parity-'),
  );
  process.env.ECHO_DISCORD_IMPORT_SOURCE_DIR = tempRoot;

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `parity_owner_${Date.now().toString(36)}`;
  const linkedUserId = `parity_linked_${Date.now().toString(36)}`;
  const canonicalLateUserId = `parity_canonical_${Date.now().toString(36)}`;
  const cleanupUserIds = [ownerId, linkedUserId, canonicalLateUserId];
  const cleanupServerIds: string[] = [];

  try {
    await pool.query('SELECT 1');
    const { ensureAuthTables } = await import('../db/authTables');
    const { ensureEchoTables } = await import('../db/echoTables');
    await ensureAuthTables(pool);
    await ensureEchoTables(pool);

    await insertAuthUser(pool, ownerId, 'Parity Owner');
    await insertAuthUser(pool, linkedUserId, 'Linked User');
    await insertAuthUser(pool, canonicalLateUserId, 'Late Canonical');

    const {
      addEchoServerMember,
      assignEchoMemberRole,
      createEchoRole,
      createEchoServer,
      listEchoChannelPermissionOverwrites,
      listEchoChannels,
      listEchoRolesForServer,
      replaceEchoChannelPermissionOverwrites,
    } = await import('../domain/echoStore');
    const { runDiscordImportStep } = await import('../services/discordImport');
    const { mergeDiscordShadows } =
      await import('../domain/discordShadowMerge');
    const { upsertDiscordUserLink } =
      await import('../domain/discordUserLinkRepo');

    await writeBundle(tempRoot, 'Moderator');

    // Scenario 1: already linked before import; native role must survive member import.
    const prelinkedServer = await createEchoServer(
      pool,
      ownerId,
      'prelinked-parity',
    );
    cleanupServerIds.push(prelinkedServer.serverId);
    await addEchoServerMember(pool, prelinkedServer.serverId, linkedUserId);
    const nativeModerator = expectCreatedRole(
      await createEchoRole(pool, prelinkedServer.serverId, ownerId, {
        name: 'Moderator',
        permissions: ['BAN_MEMBERS'],
      }),
    );
    await assignEchoMemberRole(
      pool,
      prelinkedServer.serverId,
      ownerId,
      linkedUserId,
      nativeModerator.roleId,
    );
    await upsertDiscordUserLink(pool, {
      userId: linkedUserId,
      discordUserId: 'member-user',
      accessTokenCipher: 'cipher-prelinked',
      refreshTokenCipher: null,
      tokenExpiresAt: null,
      scope: 'identify',
      discordNormalized: {
        v: 1,
        discordUserId: 'member-user',
        username: 'memuser',
        globalName: null,
        bio: null,
        avatarHash: null,
        avatarUrl: null,
        bannerHash: null,
        bannerUrl: null,
        emailPresent: false,
        premiumType: null,
        guildCount: null,
        connectionsCount: null,
      },
      discordRawCache: null,
      mergeKind: 'partial',
    });

    await runDiscordImportStep(
      pool,
      prelinkedServer.serverId,
      ownerId,
      'metadata',
    );
    await runDiscordImportStep(
      pool,
      prelinkedServer.serverId,
      ownerId,
      'roles',
    );
    await runDiscordImportStep(
      pool,
      prelinkedServer.serverId,
      ownerId,
      'members',
    );

    const prelinkedRoles = await listEchoRolesForServer(
      pool,
      prelinkedServer.serverId,
    );
    const nativeRoleAfterImport = prelinkedRoles.find(
      (role) => role.id === nativeModerator.roleId,
    );
    const importedRole = prelinkedRoles.find(
      (role) => role.name === 'Moderator (Discord Imported)',
    );
    assert.ok(nativeRoleAfterImport, 'native role should still exist');
    assert.deepEqual(nativeRoleAfterImport?.permissions, ['BAN_MEMBERS']);
    assert.ok(importedRole, 'colliding imported role should be renamed');
    const prelinkedAssignments = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [prelinkedServer.serverId, linkedUserId],
    );
    const assignedPrelinkedRoleIds = new Set(
      prelinkedAssignments.rows.map((row) => String(row.role_id)),
    );
    assert.ok(
      assignedPrelinkedRoleIds.has(nativeModerator.roleId),
      'member import must not delete native Echo role assignments',
    );
    assert.ok(
      assignedPrelinkedRoleIds.has(importedRole!.id),
      'member import should add the Discord-managed imported role',
    );

    // Scenario 2: link later after shadow/imported overwrites exist.
    const lateLinkServer = await createEchoServer(
      pool,
      ownerId,
      'late-link-parity',
    );
    cleanupServerIds.push(lateLinkServer.serverId);

    await runDiscordImportStep(
      pool,
      lateLinkServer.serverId,
      ownerId,
      'metadata',
    );
    await runDiscordImportStep(pool, lateLinkServer.serverId, ownerId, 'roles');
    await runDiscordImportStep(
      pool,
      lateLinkServer.serverId,
      ownerId,
      'members',
    );
    await runDiscordImportStep(
      pool,
      lateLinkServer.serverId,
      ownerId,
      'channels',
    );

    const shadowRow = await pool.query<{ shadow_user_id: string }>(
      `SELECT shadow_user_id FROM echo_discord_shadow_users WHERE discord_user_id = $1 AND source_server_id = $2`,
      ['member-user', lateLinkServer.serverId],
    );
    assert.equal(shadowRow.rows.length, 1);
    const shadowUserId = String(shadowRow.rows[0]!.shadow_user_id);

    await addEchoServerMember(
      pool,
      lateLinkServer.serverId,
      canonicalLateUserId,
    );
    const localOnlyRole = expectCreatedRole(
      await createEchoRole(pool, lateLinkServer.serverId, ownerId, {
        name: 'Local Only',
        permissions: ['KICK_MEMBERS'],
      }),
    );
    await assignEchoMemberRole(
      pool,
      lateLinkServer.serverId,
      ownerId,
      canonicalLateUserId,
      localOnlyRole.roleId,
    );

    const lateLinkRoles = await listEchoRolesForServer(
      pool,
      lateLinkServer.serverId,
    );
    const importedLateRole = lateLinkRoles.find(
      (role) => role.name === 'Moderator',
    );
    assert.ok(
      importedLateRole,
      'non-colliding imported role should keep its name',
    );

    const lateLinkChannels = await listEchoChannels(
      pool,
      lateLinkServer.serverId,
    );
    const chatChannel = lateLinkChannels.find(
      (channel) => channel.name === 'chat',
    );
    assert.ok(chatChannel);

    const beforeMergeOverwrites = await listEchoChannelPermissionOverwrites(
      pool,
      lateLinkServer.serverId,
      chatChannel!.id,
    );
    assert.ok(
      beforeMergeOverwrites.some(
        (row) => row.targetType === 'member' && row.targetId === shadowUserId,
      ),
      'member-specific imported overwrite should initially target the shadow user',
    );

    const overwriteReplace = await replaceEchoChannelPermissionOverwrites(
      pool,
      lateLinkServer.serverId,
      ownerId,
      chatChannel!.id,
      [
        {
          targetType: 'member',
          targetId: canonicalLateUserId,
          partial: { SEND_MESSAGES: false },
        },
        {
          targetType: 'member',
          targetId: shadowUserId,
          partial: { SEND_MESSAGES: true },
        },
      ],
    );
    assert.equal(overwriteReplace, 'ok');

    await upsertDiscordUserLink(pool, {
      userId: canonicalLateUserId,
      discordUserId: 'member-user',
      accessTokenCipher: 'cipher-late-link',
      refreshTokenCipher: null,
      tokenExpiresAt: null,
      scope: 'identify',
      discordNormalized: {
        v: 1,
        discordUserId: 'member-user',
        username: 'memuser',
        globalName: null,
        bio: null,
        avatarHash: null,
        avatarUrl: null,
        bannerHash: null,
        bannerUrl: null,
        emailPresent: false,
        premiumType: null,
        guildCount: null,
        connectionsCount: null,
      },
      discordRawCache: null,
      mergeKind: 'partial',
    });

    await mergeDiscordShadows(pool, {
      discordUserId: 'member-user',
      canonicalUserId: canonicalLateUserId,
    });

    const shadowGone = await pool.query(
      `SELECT 1 FROM echo_discord_shadow_users WHERE shadow_user_id = $1`,
      [shadowUserId],
    );
    assert.equal(
      shadowGone.rows.length,
      0,
      'shadow user should be deleted after merge',
    );

    const lateAssignments = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [lateLinkServer.serverId, canonicalLateUserId],
    );
    const assignedLateRoleIds = new Set(
      lateAssignments.rows.map((row) => String(row.role_id)),
    );
    assert.ok(
      assignedLateRoleIds.has(localOnlyRole.roleId),
      'native Echo role should remain after late link',
    );
    assert.ok(
      assignedLateRoleIds.has(importedLateRole!.id),
      'Discord-managed role should move from shadow to canonical user',
    );

    const afterMergeOverwrites = await listEchoChannelPermissionOverwrites(
      pool,
      lateLinkServer.serverId,
      chatChannel!.id,
    );
    const canonicalOverwrite = afterMergeOverwrites.find(
      (row) =>
        row.targetType === 'member' && row.targetId === canonicalLateUserId,
    );
    assert.ok(
      canonicalOverwrite,
      'member overwrite should move to canonical user',
    );
    assert.equal(
      canonicalOverwrite?.partial.SEND_MESSAGES,
      true,
      'Discord-imported member overwrite should win when shadow merges into an existing canonical row',
    );
    assert.equal(
      afterMergeOverwrites.some(
        (row) => row.targetType === 'member' && row.targetId === shadowUserId,
      ),
      false,
    );

    console.log('discordImport.accountParity.test.ts: ok');
  } finally {
    for (const serverId of cleanupServerIds) {
      await pool
        .query(`DELETE FROM echo_servers WHERE id = $1`, [serverId])
        .catch(() => {});
    }
    await pool
      .query(
        `DELETE FROM auth_discord_user_links WHERE user_id = ANY($1::text[])`,
        [cleanupUserIds],
      )
      .catch(() => {});
    await pool
      .query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
        cleanupUserIds,
      ])
      .catch(() => {});
    await pool.end();
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
