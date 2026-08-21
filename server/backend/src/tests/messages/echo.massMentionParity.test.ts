import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  canUserSendMassMentionInChannel,
  createEchoServer,
  getEchoChannelCapabilitiesForUser,
  getEchoServerCapabilitiesForUser,
  listEchoRolesForServer,
  updateEchoRole,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `mm_${id.replace(/[^a-z0-9]/gi, '').slice(0, 18)}`;
  const email = `${username}@mass-mention.echo.test`;
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
      'Skipping echo.massMentionParity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `mm_owner_${Date.now().toString(36)}`;
  const memberId = `mm_member_${Date.now().toString(36)}`;
  let serverId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);

    const created = await createEchoServer(
      pool,
      ownerId,
      'mass-mention-parity',
    );
    serverId = created.serverId;
    await addEchoServerMember(pool, serverId, memberId);

    const broadcastMentions = [
      {
        id: 'm1',
        kind: 'everyone' as const,
      },
    ];

    const beforeServerCaps = await getEchoServerCapabilitiesForUser(
      pool,
      serverId,
      memberId,
    );
    const beforeChannelCaps = await getEchoChannelCapabilitiesForUser(
      pool,
      created.defaultChannelId,
      memberId,
    );
    assert.equal(beforeServerCaps.canMentionEveryone, false);
    assert.equal(beforeChannelCaps.canMentionEveryone, false);
    assert.equal(
      await canUserSendMassMentionInChannel(
        pool,
        memberId,
        created.defaultChannelId,
        broadcastMentions,
      ),
      false,
    );

    const roles = await listEchoRolesForServer(pool, serverId);
    const everyoneRole = roles.find((role) => role.name === '@everyone');
    assert.ok(everyoneRole, 'Expected @everyone role to exist');
    assert.equal(
      await updateEchoRole(pool, serverId, ownerId, everyoneRole!.id, {
        permissions: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MENTION_EVERYONE'],
      }),
      'ok',
    );

    const afterServerCaps = await getEchoServerCapabilitiesForUser(
      pool,
      serverId,
      memberId,
    );
    const afterChannelCaps = await getEchoChannelCapabilitiesForUser(
      pool,
      created.defaultChannelId,
      memberId,
    );
    assert.equal(afterServerCaps.canMentionEveryone, true);
    assert.equal(afterChannelCaps.canMentionEveryone, true);
    assert.equal(
      await canUserSendMassMentionInChannel(
        pool,
        memberId,
        created.defaultChannelId,
        broadcastMentions,
      ),
      true,
    );

    console.log('echo.massMentionParity: ok');
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
