import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  createEchoServer,
  joinEchoServerFromDirectory,
  updateEchoServerPreferences,
} from '../domain/echoStore';
import {
  formatEchoMemberJoinWelcomeContent,
  postEchoMemberJoinWelcomeNotice,
} from '../services/echoMemberJoinWelcomeNotice';

const testLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => testLog,
} as unknown as FastifyBaseLogger;

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `u_${id}`.slice(0, 32);
  const email = `${username}@welcome.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, displayName, passwordHash],
  );
}

async function countWelcomeMessages(
  pool: pg.Pool,
  channelId: string,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM echo_messages
    WHERE channel_id = $1 AND system_message = true AND bridge_source = 'member_join_welcome'
    `,
    [channelId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function run(): Promise<void> {
  assert.equal(
    formatEchoMemberJoinWelcomeContent('Alice'),
    'Alice joined the server.',
  );
  assert.equal(
    formatEchoMemberJoinWelcomeContent('  '),
    'Someone joined the server.',
  );

  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.memberJoinWelcome: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ts = Date.now().toString(36);
  const ownerId = `welcome_owner_${ts}`;
  const joinerId = `welcome_joiner_${ts}`;
  let serverId = '';
  let defaultChannelId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId, 'Welcome Owner');
    await insertAuthUser(pool, joinerId, 'Welcome Joiner');

    const created = await createEchoServer(pool, ownerId, 'welcome-test');
    serverId = created.serverId;
    defaultChannelId = created.defaultChannelId;

    await pool.query(
      `UPDATE echo_servers SET listed_in_directory = true WHERE id = $1`,
      [serverId],
    );

    const setWelcome = await updateEchoServerPreferences(
      pool,
      serverId,
      ownerId,
      { welcomeChannelId: defaultChannelId },
    );
    assert.equal(setWelcome, 'ok');

    const join = await joinEchoServerFromDirectory(
      pool,
      serverId,
      joinerId,
      null,
      { log: testLog },
    );
    assert.equal(join.ok, true);
    assert.equal(join.alreadyMember, false);

    const msgs = await pool.query(
      `
      SELECT content, system_message, bridge_source
      FROM echo_messages
      WHERE channel_id = $1
      ORDER BY created_at ASC
      `,
      [defaultChannelId],
    );
    assert.equal(msgs.rows.length, 1);
    assert.equal(msgs.rows[0].content, 'Welcome Joiner joined the server.');
    assert.equal(msgs.rows[0].system_message, true);
    assert.equal(msgs.rows[0].bridge_source, 'member_join_welcome');

    const rejoin = await joinEchoServerFromDirectory(
      pool,
      serverId,
      joinerId,
      null,
      { log: testLog },
    );
    assert.equal(rejoin.ok, true);
    assert.equal(rejoin.alreadyMember, true);
    assert.equal(await countWelcomeMessages(pool, defaultChannelId), 1);

    const cleared = await updateEchoServerPreferences(pool, serverId, ownerId, {
      welcomeChannelId: null,
    });
    assert.equal(cleared, 'ok');

    const joiner2Id = `welcome_joiner2_${ts}`;
    await insertAuthUser(pool, joiner2Id, 'Second Joiner');
    const join2 = await joinEchoServerFromDirectory(
      pool,
      serverId,
      joiner2Id,
      null,
      { log: testLog },
    );
    assert.equal(join2.ok, true);
    assert.equal(await countWelcomeMessages(pool, defaultChannelId), 1);

    const invalid = await updateEchoServerPreferences(pool, serverId, ownerId, {
      welcomeChannelId: 'nonexistent_channel_id',
    });
    assert.equal(invalid, 'invalid_body');

    await postEchoMemberJoinWelcomeNotice(pool, undefined, testLog, {
      serverId,
      userId: joiner2Id,
    });
    assert.equal(await countWelcomeMessages(pool, defaultChannelId), 1);

    console.log('echo.memberJoinWelcome: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_messages WHERE channel_id = $1`, [
        defaultChannelId,
      ]);
      await pool.query(`DELETE FROM echo_server_members WHERE server_id = $1`, [
        serverId,
      ]);
      await pool.query(`DELETE FROM echo_channels WHERE server_id = $1`, [
        serverId,
      ]);
      await pool.query(`DELETE FROM echo_categories WHERE server_id = $1`, [
        serverId,
      ]);
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, joinerId, `welcome_joiner2_${ts}`],
    ]);
    await pool.end();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
