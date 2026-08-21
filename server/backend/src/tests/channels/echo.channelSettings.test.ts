import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  addEchoServerMember,
  createEchoServer,
  createEchoChannel,
  echoChannelAllowsMessageUnderSlowmode,
  echoSendPlainTextViolatesHardFormat,
  joinEchoVoiceChannel,
  listEchoChannels,
  patchEchoChannel,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `chset_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@chset.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Channel settings test', passwordHash],
  );
}

async function grantEveryoneForChannelTests(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_roles
    SET permissions = permissions || '["MANAGE_ROLES","VIEW_CHANNEL","SEND_MESSAGE"]'::jsonb
    WHERE server_id = $1 AND name = '@everyone'
    `,
    [serverId],
  );
}

async function run(): Promise<void> {
  assert.equal(
    echoSendPlainTextViolatesHardFormat({
      template: '- ',
      hard: true,
      plain: 'hi',
    }),
    true,
  );
  assert.equal(
    echoSendPlainTextViolatesHardFormat({
      template: '- ',
      hard: true,
      plain: '- ok',
    }),
    false,
  );
  assert.equal(
    echoSendPlainTextViolatesHardFormat({
      template: '- ',
      hard: true,
      plain: '   ',
    }),
    false,
  );
  assert.equal(
    echoSendPlainTextViolatesHardFormat({
      template: 'Name:\r\nAge:\r\n',
      hard: true,
      plain: 'Name:\nAge:\nok',
    }),
    false,
  );

  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.channelSettings: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `chset_owner_${Date.now().toString(36)}`;
  const member2Id = `chset_m2_${Date.now().toString(36)}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, member2Id);

    const created = await createEchoServer(pool, ownerId, 'chset-test');
    serverId = created.serverId;
    await grantEveryoneForChannelTests(pool, serverId);
    await addEchoServerMember(pool, serverId, member2Id);

    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    const categoryId = String(cat.rows[0]!.id);
    const voiceId = await createEchoChannel(
      pool,
      serverId,
      'vc',
      'voice',
      categoryId,
    );
    if (voiceId === 'invalid_category') assert.fail('voice channel');

    await pool.query(`UPDATE echo_channels SET user_limit = 1 WHERE id = $1`, [
      voiceId,
    ]);

    const j1 = await joinEchoVoiceChannel(pool, serverId, voiceId, ownerId);
    assert.equal(j1.ok, true);
    const j2 = await joinEchoVoiceChannel(pool, serverId, voiceId, member2Id);
    assert.equal(j2.ok, false);
    assert.equal(j2.reason, 'full');

    const textId = created.defaultChannelId;
    const rPatch = await patchEchoChannel(pool, serverId, ownerId, textId, {
      slowmodeSeconds: 5,
      nsfw: true,
      userLimit: 0,
      iconKey: 'sparkle.svg',
    });
    assert.equal(rPatch, 'ok');

    await pool.query(
      `INSERT INTO echo_messages (id, channel_id, author_id, content, mentions, reply_to, edited_at, deleted_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL)`,
      [`msg_chset_${Date.now()}`, textId, member2Id, 'hi'],
    );
    const slowOk = await echoChannelAllowsMessageUnderSlowmode(
      pool,
      serverId,
      member2Id,
      textId,
    );
    assert.equal(slowOk, false);

    const list = await listEchoChannels(pool, serverId);
    const row = list.find((c) => c.id === textId);
    assert.equal(row?.slowmodeSeconds, 5);
    assert.equal(row?.nsfw, true);
    assert.equal(row?.iconKey, 'sparkle.svg');

    const iconUrl = 'https://cdn.example.com/emotes/abc123.webp';
    const rIconUrl = await patchEchoChannel(pool, serverId, ownerId, textId, {
      iconKey: iconUrl,
    });
    assert.equal(rIconUrl, 'ok');
    const rowUrl = (await listEchoChannels(pool, serverId)).find(
      (c) => c.id === textId,
    );
    assert.equal(rowUrl?.iconKey, iconUrl);

    const rVoiceMeta = await patchEchoChannel(
      pool,
      serverId,
      ownerId,
      voiceId,
      {
        bitrateBps: 64_000,
        userLimit: 2,
      },
    );
    assert.equal(rVoiceMeta, 'ok');
    const vrow = (await listEchoChannels(pool, serverId)).find(
      (c) => c.id === voiceId,
    );
    assert.equal(vrow?.bitrateBps, 64_000);
    assert.equal(vrow?.userLimit, 2);

    const rBad = await patchEchoChannel(pool, serverId, ownerId, textId, {
      bitrateBps: 64_000,
    });
    assert.equal(rBad, 'invalid_body');

    const rFmt = await patchEchoChannel(pool, serverId, ownerId, textId, {
      messageFormatTemplate: '- ',
      messageFormatHard: true,
    });
    assert.equal(rFmt, 'ok');
    const fmtList = await listEchoChannels(pool, serverId);
    const txtFmt = fmtList.find((c) => c.id === textId);
    assert.equal(txtFmt?.messageFormatTemplate, '- ');
    assert.equal(txtFmt?.messageFormatHard, true);

    const rVoiceFmt = await patchEchoChannel(pool, serverId, ownerId, voiceId, {
      messageFormatTemplate: 'nope',
    });
    assert.equal(rVoiceFmt, 'invalid_body');

    const rClear = await patchEchoChannel(pool, serverId, ownerId, textId, {
      messageFormatTemplate: '',
      messageFormatHard: true,
    });
    assert.equal(rClear, 'ok');
    const cleared = (await listEchoChannels(pool, serverId)).find(
      (c) => c.id === textId,
    );
    assert.equal(cleared?.messageFormatTemplate, '');
    assert.equal(cleared?.messageFormatHard, false);

    console.log('echo.channelSettings: ok');
  } finally {
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [ownerId, member2Id],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
