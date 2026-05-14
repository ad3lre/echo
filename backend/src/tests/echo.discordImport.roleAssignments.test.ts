import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const GUILD_ID = '88880001';
const ROLE_MOD = '31001';
const ROLE_VIP = '31002';
const ROLE_MANAGED = '31003';
const ROLE_EXTRA = '31004';
const MEMBER_DISCORD_USER = '77700001';

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
    [id, username, email, 'Discord import role test', passwordHash],
  );
}

async function writeMinimalBundle(
  root: string,
  memberRoles: unknown[],
  rolesJson: unknown[],
): Promise<void> {
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      guildId: GUILD_ID,
      guildName: 'Role Assignment Test',
      completeness: { echoCoreOk: true, warnings: [] },
    }),
  );
  await writeFile(
    path.join(root, 'guild.json'),
    JSON.stringify({
      id: GUILD_ID,
      name: 'Role Assignment Test',
      description: '',
    }),
  );
  await writeFile(
    path.join(root, 'asset_manifest.json'),
    JSON.stringify({ emojis: {}, errors: [], roleIcons: {} }),
  );
  await writeFile(path.join(root, 'emojis.json'), JSON.stringify([]));
  await writeFile(path.join(root, 'roles.json'), JSON.stringify(rolesJson));
  await writeFile(
    path.join(root, 'channels.json'),
    JSON.stringify([
      { id: 'cat-r', type: 4, name: 'Text', position: 0 },
      {
        id: 'ch-r',
        type: 0,
        name: 'general',
        parent_id: 'cat-r',
        position: 0,
        nsfw: false,
      },
    ]),
  );
  await writeFile(path.join(root, 'overwrites.jsonl'), '');
  await writeFile(
    path.join(root, 'members.jsonl'),
    `${JSON.stringify({
      user: {
        id: MEMBER_DISCORD_USER,
        username: 'member1',
        avatar: null,
      },
      roles: memberRoles,
    })}\n`,
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.discordImport.roleAssignments: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'echo-discord-import-roles-'),
  );
  process.env.ECHO_DISCORD_IMPORT_SOURCE_DIR = tempRoot;

  const perms = permissionBits(['VIEW_CHANNEL', 'SEND_MESSAGES']);
  const baseRoles = [
    {
      id: ROLE_MOD,
      name: 'ModTeam',
      permissions: perms,
      color: 0xff0000,
      hoist: false,
    },
    {
      id: ROLE_VIP,
      name: 'VIP Lounge',
      permissions: perms,
      color: 0x00ff00,
      hoist: true,
    },
    {
      id: ROLE_MANAGED,
      name: 'BotManaged',
      permissions: '0',
      color: 0,
      managed: true,
    },
    {
      id: GUILD_ID,
      name: '@everyone',
      permissions: perms,
      color: 0x99aab5,
      hoist: false,
    },
  ];

  await writeMinimalBundle(
    tempRoot,
    // Guild id string, Mod as safe integer, VIP string, managed role id (unmapped)
    [GUILD_ID, Number(ROLE_MOD), ROLE_VIP, ROLE_MANAGED],
    baseRoles,
  );

  const { ensureEchoTables } = await import('../db/echoTables');
  const { createEchoServer } = await import('../domain/echoStore');
  const { runDiscordImportStep } = await import('../services/discordImport');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `dimport_ra_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
        console.log(
          'Skipping echo.discordImport.roleAssignments: Postgres is not reachable',
        );
        return;
      }
      throw error;
    }
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    const created = await createEchoServer(pool, ownerId, 'role-assign-test');
    serverId = created.serverId;

    await runDiscordImportStep(pool, serverId, ownerId, 'metadata');
    await runDiscordImportStep(pool, serverId, ownerId, 'roles', {
      force: true,
    });
    await runDiscordImportStep(pool, serverId, ownerId, 'members');

    const grantsAfterImport = await pool.query(
      `SELECT role_id FROM echo_discord_member_role_grants WHERE server_id = $1 AND discord_user_id = $2 ORDER BY role_id`,
      [serverId, MEMBER_DISCORD_USER],
    );
    assert.equal(
      grantsAfterImport.rows.length,
      2,
      'Mod + VIP should be stored; managed Discord role skipped; @everyone not stored as a grant',
    );

    const roleNames = await pool.query<{ name: string }>(
      `
      SELECT r.name
      FROM echo_member_roles mr
      INNER JOIN echo_roles r ON r.id = mr.role_id AND r.server_id = mr.server_id
      WHERE mr.server_id = $1 AND mr.user_id = (
        SELECT shadow_user_id FROM echo_discord_shadow_users
        WHERE discord_user_id = $2 AND source_server_id = $1 LIMIT 1
      )
      AND r.name NOT IN ('@everyone')
      ORDER BY r.name
      `,
      [serverId, MEMBER_DISCORD_USER],
    );
    const names = roleNames.rows.map((r) => r.name).sort();
    assert.deepEqual(names, ['ModTeam', 'VIP Lounge']);

    await writeMinimalBundle(tempRoot, [GUILD_ID, Number(ROLE_MOD)], baseRoles);
    await runDiscordImportStep(pool, serverId, ownerId, 'members', {
      force: true,
    });
    const grantsAfterTrim = await pool.query(
      `SELECT role_id FROM echo_discord_member_role_grants WHERE server_id = $1 AND discord_user_id = $2`,
      [serverId, MEMBER_DISCORD_USER],
    );
    assert.equal(
      grantsAfterTrim.rows.length,
      1,
      'VIP grant removed after resync',
    );

    const rolesWithExtra = [
      baseRoles[0],
      baseRoles[2],
      {
        id: ROLE_EXTRA,
        name: 'Extra',
        permissions: perms,
        color: 0,
        hoist: false,
      },
      baseRoles[3],
    ];
    await writeMinimalBundle(
      tempRoot,
      [GUILD_ID, Number(ROLE_MOD), ROLE_EXTRA],
      rolesWithExtra,
    );
    await runDiscordImportStep(pool, serverId, ownerId, 'roles', {
      force: true,
    });
    await runDiscordImportStep(pool, serverId, ownerId, 'members', {
      force: true,
    });
    const grantsAfterMerge = await pool.query(
      `SELECT role_id FROM echo_discord_member_role_grants WHERE server_id = $1 AND discord_user_id = $2`,
      [serverId, MEMBER_DISCORD_USER],
    );
    assert.equal(
      grantsAfterMerge.rows.length,
      2,
      'Forced role merge + member resync should add Extra alongside Mod',
    );
  } finally {
    await pool.end().catch(() => {});
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
