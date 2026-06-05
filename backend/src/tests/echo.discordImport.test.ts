import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
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

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `dimport_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@discordimport.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Discord import test', passwordHash],
  );
}

async function writeBundle(
  tempRoot: string,
  echoCoreOk: boolean,
): Promise<void> {
  await mkdir(path.join(tempRoot, 'assets'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'assets', 'guild_icon.png'),
    Buffer.from('icon-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'guild_banner.png'),
    Buffer.from('banner-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'manifest.json'),
    JSON.stringify({
      guildId: 'discord-guild-1',
      guildName: 'MTI Imported',
      completeness: {
        echoCoreOk,
        warnings: ['bundle warning'],
      },
    }),
  );
  await writeFile(
    path.join(tempRoot, 'guild.json'),
    JSON.stringify({
      id: 'discord-guild-1',
      name: 'MTI Imported',
      description: 'Imported from the MTI Discord export',
    }),
  );
  await writeFile(
    path.join(tempRoot, 'asset_manifest.json'),
    JSON.stringify({
      guildIcon: 'assets/guild_icon.png',
      guildBanner: 'assets/guild_banner.png',
      emojis: {
        'emoji-joy': 'assets/emojis/Joy_emoji-joy.png',
        'emoji-wave': 'assets/emojis/wave_emoji-wave.gif',
        // Some exporters list sticker assets under `emojis` as well; must not become custom emojis.
        'sticker-snow': 'assets/stickers/snow_sticker-snow.png',
        // Mis-filed sticker row only in emojis.json (has Discord `format_type`).
        'weird-sticker': 'assets/stickers/weird_weird-sticker.png',
        'sticker-json-only': 'assets/stickers/json_sticker-json-only.png',
      },
      stickers: {
        'sticker-snow': 'assets/stickers/snow_sticker-snow.png',
      },
      roleIcons: {},
      errors: [],
    }),
  );
  await mkdir(path.join(tempRoot, 'assets', 'emojis'), { recursive: true });
  await mkdir(path.join(tempRoot, 'assets', 'stickers'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'assets', 'emojis', 'Joy_emoji-joy.png'),
    Buffer.from('emoji-joy-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'emojis', 'wave_emoji-wave.gif'),
    Buffer.from('emoji-wave-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'stickers', 'snow_sticker-snow.png'),
    Buffer.from('sticker-snow-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'stickers', 'weird_weird-sticker.png'),
    Buffer.from('weird-sticker-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'assets', 'stickers', 'json_sticker-json-only.png'),
    Buffer.from('sticker-json-only-bytes'),
  );
  await writeFile(
    path.join(tempRoot, 'emojis.json'),
    JSON.stringify([
      {
        id: 'emoji-joy',
        name: 'Joy',
        animated: false,
        imageURL: 'https://cdn.discordapp.com/emojis/emoji-joy.webp',
      },
      {
        id: 'emoji-wave',
        name: 'Party Wave',
        animated: true,
        imageURL: 'https://cdn.discordapp.com/emojis/emoji-wave.gif',
      },
      {
        id: 'weird-sticker',
        name: 'NotAnEmoji',
        format_type: 1,
        imageURL: 'https://cdn.discordapp.com/stickers/weird-sticker.png',
      },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'stickers.json'),
    JSON.stringify([
      {
        id: 'sticker-json-only',
        name: 'JsonSticker',
        format_type: 1,
      },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'roles.json'),
    JSON.stringify([
      {
        id: 'role-mod',
        name: 'Moderators',
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
      { id: 'cat-announcements', type: 4, name: 'Announcements', position: 0 },
      { id: 'cat-general', type: 4, name: 'General', position: 1 },
      {
        id: 'ch-rules',
        type: 0,
        name: 'rules',
        parent_id: 'cat-announcements',
        position: 0,
        nsfw: false,
      },
      {
        id: 'ch-news',
        type: 5,
        name: 'server-news',
        parent_id: 'cat-announcements',
        position: 1,
        nsfw: false,
      },
      {
        id: 'ch-stage',
        type: 13,
        name: 'Town Hall',
        parent_id: 'cat-general',
        position: 0,
        bitrate: 64000,
        user_limit: 99,
      },
      {
        id: 'ch-lobby',
        type: 2,
        name: 'Lobby',
        parent_id: 'cat-general',
        position: 1,
        bitrate: 64000,
        user_limit: 7,
      },
      {
        id: 'ch-chat',
        type: 0,
        name: 'chat',
        parent_id: 'cat-general',
        position: 2,
        rate_limit_per_user: 5,
        nsfw: false,
      },
      { id: 'ch-loose', type: 0, name: 'loose-chat', position: 0, nsfw: false },
      {
        id: 'ch-orphan',
        type: 0,
        name: 'orphan-chat',
        parent_id: 'cat-missing',
        position: 0,
        nsfw: false,
      },
      { id: 'forum-skip', type: 15, name: 'Forum Stuff' },
    ]),
  );
  await writeFile(
    path.join(tempRoot, 'overwrites.jsonl'),
    [
      JSON.stringify({
        channelId: 'cat-general',
        id: 'discord-guild-1',
        type: 0,
        allow: permissionBits(['VIEW_CHANNEL']),
        deny: '0',
      }),
      JSON.stringify({
        channelId: 'ch-news',
        id: 'discord-guild-1',
        type: 0,
        allow: '0',
        deny: permissionBits(['SEND_MESSAGES']),
      }),
      JSON.stringify({
        channelId: 'ch-news',
        id: 'role-mod',
        type: 0,
        allow: permissionBits(['SEND_MESSAGES']),
        deny: '0',
      }),
      JSON.stringify({
        channelId: 'ch-chat',
        id: 'discord-guild-1',
        type: 0,
        allow: '0',
        deny: permissionBits(['SEND_MESSAGES']),
      }),
      JSON.stringify({
        channelId: 'ch-chat',
        id: 'role-mod',
        type: 0,
        allow: permissionBits(['SEND_MESSAGES']),
        deny: '0',
      }),
      JSON.stringify({
        channelId: 'ch-chat',
        id: 'member-user',
        type: 1,
        allow: permissionBits(['SEND_MESSAGES']),
        deny: '0',
      }),
      JSON.stringify({
        channelId: 'ch-chat',
        id: '999999999999999999',
        type: 1,
        allow: permissionBits(['VIEW_CHANNEL']),
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

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.discordImport: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'echo-discord-import-'),
  );
  process.env.ECHO_DISCORD_IMPORT_SOURCE_DIR = tempRoot;

  const { ensureEchoTables } = await import('../db/echoTables');
  const {
    createEchoServer,
    listEchoCategories,
    listEchoCategoryPermissionOverwrites,
    listEchoChannelPermissionOverwrites,
    listEchoChannels,
    listEchoServerEmojiLibrary,
    listEchoRolesForServer,
  } = await import('../domain/echoStore');
  const { runDiscordImportStep, getDiscordImportState } =
    await import('../services/discordImport');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `dimport_owner_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
        console.log('Skipping echo.discordImport: Postgres is not reachable');
        return;
      }
      throw error;
    }
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await writeBundle(tempRoot, false);

    const created = await createEchoServer(
      pool,
      ownerId,
      'discord-import-test',
    );
    serverId = created.serverId;

    await assert.rejects(
      runDiscordImportStep(pool, serverId, ownerId, 'metadata'),
      /echoCoreOk/i,
    );

    let failedState = await getDiscordImportState(pool, serverId);
    assert.ok(failedState);
    assert.match(failedState.lastError, /echoCoreOk/i);
    assert.equal(failedState.nextStep, 'metadata');
    assert.equal(failedState.completedSteps, 0);
    assert.equal(failedState.preview?.guildName, 'MTI Imported');
    assert.equal(failedState.preview?.categoryCount, 2);
    assert.equal(failedState.preview?.channelCount, 6);
    assert.equal(failedState.preview?.unsupportedChannelCount, 1);
    assert.equal(failedState.preview?.uncategorizedChannelCount, 1);
    assert.equal(failedState.preview?.orphanedChannelCount, 1);

    await writeBundle(tempRoot, true);

    const metadataResult = await runDiscordImportStep(
      pool,
      serverId,
      ownerId,
      'metadata',
    );
    assert.equal(metadataResult.state.metadataImported, true);

    const metadataAgain = await runDiscordImportStep(
      pool,
      serverId,
      ownerId,
      'metadata',
    );
    assert.equal(metadataAgain.state.metadataImported, true);

    const serverRow = await pool.query(
      `SELECT name, description, icon_url, banner_url FROM echo_servers WHERE id = $1 LIMIT 1`,
      [serverId],
    );
    assert.equal(String(serverRow.rows[0]?.name ?? ''), 'MTI Imported');
    assert.equal(
      String(serverRow.rows[0]?.description ?? ''),
      'Imported from the MTI Discord export',
    );
    assert.match(
      String(serverRow.rows[0]?.icon_url ?? ''),
      /^data:image\/png;base64,/,
    );
    assert.match(
      String(serverRow.rows[0]?.banner_url ?? ''),
      /^data:image\/png;base64,/,
    );
    const emojiLibrary = await listEchoServerEmojiLibrary(pool, serverId);
    assert.equal(emojiLibrary.packs.length, 1);
    assert.equal(emojiLibrary.packs[0]?.source, 'custom');
    assert.equal(emojiLibrary.packs[0]?.name, 'MTI Imported Emoji Pack');
    assert.equal(emojiLibrary.packs[0]?.emojis.length, 2);
    assert.deepEqual(
      emojiLibrary.packs[0]?.emojis.map((emoji) => emoji.name).sort(),
      ['Joy', 'Party_Wave'],
    );
    assert.equal(
      emojiLibrary.packs[0]?.emojis.some((emoji) => emoji.animated),
      true,
    );

    const rolesPath = path.join(tempRoot, 'roles.json');
    const rolesParsed = JSON.parse(await readFile(rolesPath, 'utf8')) as Record<
      string,
      unknown
    >[];
    rolesParsed.push({
      id: 'role-managed-1',
      name: 'BotManaged',
      managed: true,
      permissions: permissionBits(['VIEW_CHANNEL']),
      color: 0x00ff00,
      hoist: false,
    });
    await writeFile(rolesPath, JSON.stringify(rolesParsed));

    const rolesResult = await runDiscordImportStep(
      pool,
      serverId,
      ownerId,
      'roles',
    );
    assert.equal(rolesResult.state.rolesImported, true);
    const managedIssue = rolesResult.state.roleImportIssues.find(
      (i) => i.code === 'skipped_managed',
    );
    assert.ok(managedIssue, 'expected skipped_managed role import issue');
    assert.equal(managedIssue?.roleName, 'BotManaged');
    const roles = await listEchoRolesForServer(pool, serverId);
    const moderators = roles.find((role) => role.name === 'Moderators');
    const everyone = roles.find((role) => role.isEveryone);
    assert.ok(moderators);
    assert.ok(everyone);
    assert.equal(moderators?.hoist, true);
    assert.ok(moderators?.permissions.includes('MANAGE_MESSAGES'));
    assert.ok((moderators?.position ?? -1) > (everyone?.position ?? 999));

    const membersResult = await runDiscordImportStep(
      pool,
      serverId,
      ownerId,
      'members',
    );
    assert.equal(membersResult.state.membersImported, true);
    assert.ok(membersResult.state.userMapEntryCount >= 1);

    const shadowRow = await pool.query(
      `SELECT shadow_user_id FROM echo_discord_shadow_users WHERE discord_user_id = $1 AND source_server_id = $2`,
      ['member-user', serverId],
    );
    assert.equal(shadowRow.rows.length, 1);
    const shadowId = String(shadowRow.rows[0]!.shadow_user_id);
    const memberRoles = await pool.query(
      `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [serverId, shadowId],
    );
    assert.ok(
      memberRoles.rows.some(
        (r) => String(r.role_id) === String(moderators!.id),
      ),
      'imported Discord member should receive mapped Moderators role',
    );

    const channelsResult = await runDiscordImportStep(
      pool,
      serverId,
      ownerId,
      'channels',
    );
    assert.equal(channelsResult.state.channelsImported, true);
    assert.ok(channelsResult.nextChannelId);

    const categories = await listEchoCategories(pool, serverId);
    assert.ok(categories.some((category) => category.name === 'Announcements'));
    assert.ok(categories.some((category) => category.name === 'General'));
    assert.equal(
      categories.some((category) => category.name === 'Imported Channels'),
      false,
      'uncategorized Discord channels must not create an Imported Channels category',
    );
    assert.ok(
      categories.some((category) => /^Imported Orphaned /.test(category.name)),
    );

    const channels = await listEchoChannels(pool, serverId);
    const rules = channels.find((channel) => channel.name === 'rules');
    const serverNews = channels.find(
      (channel) => channel.name === 'server-news',
    );
    const chat = channels.find((channel) => channel.name === 'chat');
    const townHall = channels.find((channel) => channel.name === 'Town Hall');
    const lobby = channels.find((channel) => channel.name === 'Lobby');
    const loose = channels.find((channel) => channel.name === 'loose-chat');
    const orphan = channels.find((channel) => channel.name === 'orphan-chat');
    const announcementsCategory = categories.find(
      (category) => category.name === 'Announcements',
    );
    const generalCategory = categories.find(
      (category) => category.name === 'General',
    );
    assert.ok(chat);
    assert.ok(townHall);
    assert.equal(townHall?.type, 'stage');
    assert.equal(
      String(townHall?.iconKey ?? ''),
      'sofa',
      'Discord GUILD_STAGE_VOICE should import as Echo stage channel',
    );
    assert.ok(lobby);
    assert.ok(rules);
    assert.ok(serverNews);
    assert.equal(serverNews?.type, 'text');
    assert.ok(loose);
    assert.ok(orphan);
    assert.ok(announcementsCategory);
    assert.ok(generalCategory);
    assert.equal(rules?.categoryId, announcementsCategory?.id);
    assert.equal(townHall?.categoryId, generalCategory?.id);
    assert.equal(lobby?.categoryId, generalCategory?.id);
    assert.equal(chat?.categoryId, generalCategory?.id);
    assert.equal((loose?.categoryId ?? '').trim(), '');
    assert.notEqual((orphan?.categoryId ?? '').trim(), '');
    assert.equal(
      announcementsCategory?.position,
      0,
      'Discord categories use guild-level sidebar index (interleaves with root channels)',
    );
    assert.equal(
      generalCategory?.position,
      2,
      'Second category index accounts for categoryless channel between categories in export',
    );
    assert.equal(
      loose?.position,
      1,
      'Categoryless channel uses same sidebar index space as categories (not raw duplicate position 0)',
    );
    assert.equal(townHall?.position, 0);
    assert.equal(lobby?.position, 1);
    assert.equal(chat?.position, 2);
    assert.ok(
      chat?.discordChannelId && String(chat.discordChannelId).trim(),
      'Discord-linked Echo channels should expose discordChannelId for empty-channel message import UI',
    );
    assert.equal(chat?.slowmodeSeconds, 5);
    assert.equal(townHall?.bitrateBps, 64000);
    assert.equal(townHall?.userLimit, 99);
    assert.equal(lobby?.bitrateBps, 64000);
    assert.equal(lobby?.userLimit, 7);

    const categoryRows = await listEchoCategoryPermissionOverwrites(
      pool,
      serverId,
      generalCategory!.id,
    );
    const chatRows = await listEchoChannelPermissionOverwrites(
      pool,
      serverId,
      chat!.id,
    );
    assert.equal(
      categoryRows.find((row) => row.targetType === 'members')?.partial
        .VIEW_CHANNEL,
      true,
    );
    assert.equal(
      chatRows.find((row) => row.targetType === 'members')?.partial
        .SEND_MESSAGES,
      false,
    );
    assert.equal(
      chatRows.find((row) => row.targetType === 'role')?.partial.SEND_MESSAGES,
      true,
    );

    const serverNewsRows = await listEchoChannelPermissionOverwrites(
      pool,
      serverId,
      serverNews!.id,
    );
    assert.equal(
      serverNewsRows.find((row) => row.targetType === 'members')?.partial
        .SEND_MESSAGES,
      false,
      'GUILD_NEWS: @members should not send (typical announcement channel)',
    );
    assert.equal(
      serverNewsRows.find((row) => row.targetType === 'role')?.partial
        .SEND_MESSAGES,
      true,
      'GUILD_NEWS: moderator role retains SEND_MESSAGES',
    );
    const memberOverwrite = chatRows.find(
      (row) => row.targetType === 'member' && row.targetId === shadowId,
    );
    assert.ok(
      memberOverwrite,
      'expected imported member-specific overwrite row',
    );
    assert.equal(memberOverwrite?.partial.SEND_MESSAGES, true);

    const finalState = await getDiscordImportState(pool, serverId);
    assert.ok(finalState);
    assert.equal(finalState.channelsImported, true);
    assert.equal(finalState.nextStep, null);
    assert.equal(finalState.completedSteps, 4);
    assert.ok(
      finalState.warnings.some((warning) =>
        /not in the import map/i.test(warning),
      ),
      'expected warning for member overwrite when Discord user is missing from map',
    );
    assert.ok(
      finalState.warnings.some((warning) =>
        /unsupported discord channel type/i.test(warning.toLowerCase()),
      ),
    );
    assert.ok(
      finalState.warnings.some((warning) =>
        /missing category cat-missing/i.test(warning),
      ),
    );
    assert.ok(
      finalState.warnings.some((warning) => /bundle warning/i.test(warning)),
    );
    assert.ok(
      finalState.preview?.sampleBuckets.some(
        (bucket) => bucket.label === 'General',
      ),
    );

    console.log('echo.discordImport: ok');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (serverId) {
      await pool
        .query(`DELETE FROM echo_servers WHERE id = $1`, [serverId])
        .catch(() => {});
    }
    await pool
      .query(`DELETE FROM auth_users WHERE id = $1`, [ownerId])
      .catch(() => {});
    await pool.end();
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

run();
