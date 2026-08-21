import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  buildEchoAttentionSnapshot,
  createEchoServer,
  insertEchoMessage,
  upsertEchoChannelReadState,
} from '../../domain/echoStore';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `ams_${id.replace(/[^a-z0-9]/gi, '').slice(0, 16)}`;
  const email = `${username}@attention-multi.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (
      id,
      username,
      email,
      display_name,
      pfp,
      status,
      custom_status,
      banner_image,
      banner_color,
      banner_refraction_enabled,
      password_hash,
      updated_at
    )
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
      'Skipping echo.attentionMultiSession: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const senderId = `ams_sender_${Date.now().toString(36)}`;
  const receiverId = `ams_receiver_${Date.now().toString(36)}`;
  let serverId = '';
  let channelId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, senderId);
    await insertAuthUser(pool, receiverId);

    const created = await createEchoServer(pool, senderId, 'attention-multi');
    serverId = created.serverId;
    channelId = created.defaultChannelId;
    await addEchoServerMember(pool, serverId, receiverId);

    const messageId = nextEchoSnowflakeId();
    await insertEchoMessage(pool, {
      id: messageId,
      channelId,
      authorId: senderId,
      content: 'multi-session unread',
      mentions: [],
      searchIndexText: 'multi-session unread',
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
    });

    const sessionA = await buildEchoAttentionSnapshot(pool, receiverId);
    const sessionB = await buildEchoAttentionSnapshot(pool, receiverId);
    assert.equal(sessionA.serverAttentionByServerId[serverId]?.unread, true);
    assert.equal(sessionB.serverAttentionByServerId[serverId]?.unread, true);

    assert.equal(
      await upsertEchoChannelReadState(pool, receiverId, channelId, messageId),
      'ok',
    );

    const convergedSessionB = await buildEchoAttentionSnapshot(
      pool,
      receiverId,
    );
    assert.equal(
      convergedSessionB.channelAttentionByChannelId[channelId]
        ?.lastReadMessageId,
      messageId,
    );
    assert.equal(
      convergedSessionB.serverAttentionByServerId[serverId],
      undefined,
    );

    console.log('echo.attentionMultiSession: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [senderId, receiverId],
    ]);
    await pool.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
