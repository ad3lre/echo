import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const safe = id.replace(/[^a-z0-9]/gi, '').slice(0, 14);
  const username = `botsec_${safe}`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [
      id,
      username,
      `${username}@discord-api-security.echo.test`,
      'Bot security test',
      passwordHash,
    ],
  );
}

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL && process.env.PG_TEST_URL) {
    process.env.DATABASE_URL = process.env.PG_TEST_URL;
  }
  if (!process.env.ECHO_BACKEND_STORAGE && process.env.DATABASE_URL) {
    process.env.ECHO_BACKEND_STORAGE = 'postgres';
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping discordApi.botSecurity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const token = Date.now().toString(36);
  const ownerId = `botsec_owner_${token}`;
  const installerId = `botsec_installer_${token}`;
  const botId = `botsec_bot_${token}`;
  let serverId = '';

  try {
    const { ensureAuthTables } = await import('../db/authTables');
    const { ensureEchoTables } = await import('../db/echoTables');
    const { ensureBotTables } = await import('../db/botTables');
    const {
      addEchoServerMember,
      createEchoChannel,
      createEchoServer,
      replaceEchoChannelPermissionOverwrites,
    } = await import('../domain/echoStore');
    const { buildGuildCreatePayload, getInstalledGuildAccess } =
      await import('../api/routes/discordApi/gateway');

    await ensureAuthTables(pool);
    await ensureEchoTables(pool);
    await ensureBotTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, installerId);

    const created = await createEchoServer(pool, ownerId, 'bot-security');
    serverId = created.serverId;
    await addEchoServerMember(pool, serverId, installerId);

    const categoryRes = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 ORDER BY position ASC LIMIT 1`,
      [serverId],
    );
    const categoryId = String(categoryRes.rows[0]!.id);
    const hiddenChannelId = await createEchoChannel(
      pool,
      serverId,
      'hidden-from-installer',
      'text',
      categoryId,
    );
    if (hiddenChannelId === 'invalid_category') {
      assert.fail('expected hidden test channel creation to succeed');
    }

    const overwriteResult = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      ownerId,
      hiddenChannelId,
      [{ targetType: 'everyone', partial: { VIEW_CHANNEL: false } }],
    );
    assert.equal(overwriteResult, 'ok');

    await pool.query(
      `INSERT INTO echo_bot_applications (id, owner_user_id, name, token_hash)
       VALUES ($1, $2, $3, $4)`,
      [
        botId,
        ownerId,
        'Bot Security Test',
        createHash('sha256').update(`token-${token}`).digest('hex'),
      ],
    );
    await pool.query(
      `INSERT INTO echo_bot_guild_installs (bot_id, guild_id, installed_by_user_id)
       VALUES ($1, $2, $3)`,
      [botId, serverId, installerId],
    );

    const installed = await getInstalledGuildAccess(botId, pool);
    assert.deepEqual(installed, [{ guildId: serverId, installerId }]);

    const payload = await buildGuildCreatePayload(
      serverId,
      installerId,
      0,
      pool,
    );
    assert.ok(payload, 'expected a guild create payload');
    const channels = (payload as { channels?: Array<{ id: string }> }).channels;
    assert.ok(Array.isArray(channels), 'expected channels array');
    assert.ok(
      channels.some((channel) => channel.id === created.defaultChannelId),
      'installer-visible default channel should be included',
    );
    assert.ok(
      !channels.some((channel) => channel.id === hiddenChannelId),
      'hidden channel should not be included in bot gateway GUILD_CREATE',
    );

    console.log('discordApi.botSecurity: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM echo_bot_applications WHERE id = $1`, [
      botId,
    ]);
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, installerId],
    ]);
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
