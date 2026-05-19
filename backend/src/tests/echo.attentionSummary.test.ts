import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  addEchoServerMember,
  buildEchoAttentionSnapshot,
  createEchoServer,
  getOrCreateEchoDmThread,
  insertEchoMessage,
  upsertEchoChannelReadState,
  upsertEchoServerNotificationLevel,
} from '../domain/echoStore';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `attn_${id.replace(/[^a-z0-9]/gi, '').slice(0, 16)}`;
  const email = `${username}@attention.echo.test`;
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
      'Skipping echo.attentionSummary: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `attn_owner_${Date.now().toString(36)}`;
  const memberId = `attn_member_${Date.now().toString(36)}`;
  let serverId = '';
  let channelId = '';
  let dmChannelId = '';
  let serverMessageId = '';
  let dmMessageId = '';

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);

    const created = await createEchoServer(pool, ownerId, 'attention-summary');
    serverId = created.serverId;
    channelId = created.defaultChannelId;
    await addEchoServerMember(pool, serverId, memberId);

    const dmThread = await getOrCreateEchoDmThread(pool, ownerId, memberId);
    assert.equal(dmThread.ok, true);
    dmChannelId = dmThread.channelId;

    serverMessageId = nextEchoSnowflakeId();
    await insertEchoMessage(pool, {
      id: serverMessageId,
      channelId,
      authorId: ownerId,
      content: 'hello @member',
      mentions: [
        {
          id: 'm1',
          kind: 'user',
          label: 'member',
          start: 6,
          end: 13,
          userId: memberId,
        },
      ],
      searchIndexText: 'hello @member',
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
    });

    dmMessageId = nextEchoSnowflakeId();
    await insertEchoMessage(pool, {
      id: dmMessageId,
      channelId: dmChannelId,
      authorId: ownerId,
      content: 'ping from dm',
      mentions: [],
      searchIndexText: 'ping from dm',
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
    });

    const initial = await buildEchoAttentionSnapshot(pool, memberId);
    assert.equal(
      initial.channelAttentionByChannelId[channelId]?.lastReadMessageId,
      null,
    );
    assert.equal(initial.serverAttentionByServerId[serverId]?.unread, true);
    assert.equal(
      initial.serverAttentionByServerId[serverId]?.pingKind,
      'personal',
    );
    assert.equal(
      initial.channelAttentionByChannelId[dmChannelId]?.peerUserId,
      ownerId,
    );
    assert.equal(
      initial.channelAttentionByChannelId[dmChannelId]?.unreadCount,
      1,
    );
    assert.equal(
      initial.channelAttentionByChannelId[dmChannelId]?.firstUnreadMessageId,
      dmMessageId,
    );
    assert.equal(
      initial.serverNotificationLevelByServerId[serverId],
      'mentions',
    );

    const dmMessageId2 = nextEchoSnowflakeId();
    await insertEchoMessage(pool, {
      id: dmMessageId2,
      channelId: dmChannelId,
      authorId: ownerId,
      content: 'second ping',
      mentions: [],
      searchIndexText: 'second ping',
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
    });
    const twoUnread = await buildEchoAttentionSnapshot(pool, memberId);
    assert.equal(
      twoUnread.channelAttentionByChannelId[dmChannelId]?.unreadCount,
      2,
    );

    assert.equal(
      await upsertEchoChannelReadState(
        pool,
        memberId,
        channelId,
        serverMessageId,
      ),
      'ok',
    );
    assert.equal(
      await upsertEchoChannelReadState(
        pool,
        memberId,
        dmChannelId,
        dmMessageId2,
      ),
      'ok',
    );

    const afterRead = await buildEchoAttentionSnapshot(pool, memberId);
    assert.equal(afterRead.serverAttentionByServerId[serverId], undefined);
    assert.equal(
      afterRead.channelAttentionByChannelId[dmChannelId]?.unreadCount,
      0,
    );

    assert.equal(
      await upsertEchoServerNotificationLevel(pool, memberId, serverId, 'none'),
      'ok',
    );
    const muted = await buildEchoAttentionSnapshot(pool, memberId);
    assert.equal(muted.serverNotificationLevelByServerId[serverId], 'none');

    console.log('echo.attentionSummary: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    if (dmChannelId) {
      await pool.query(`DELETE FROM echo_channels WHERE id = $1`, [
        dmChannelId,
      ]);
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
