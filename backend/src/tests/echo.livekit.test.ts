import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  addEchoServerMember,
  applyEchoVoiceModerationAction,
  createEchoServer,
  createEchoChannel,
} from '../domain/echoStore';
import { diffEchoVoiceParticipantRosterAgainstLiveKit } from '../domain/echoStore/categoriesWorkspace';
import { TrackSource } from 'livekit-server-sdk';
import {
  liveKitRoomName,
  parseLiveKitRoomName,
  mintJoinToken,
  pfpForLiveKitParticipantMetadata,
} from '../services/livekit/livekitAdapter';

function decodeJwtPayloadJson(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('invalid JWT');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

function canPublishSourcesFromJwt(jwt: string): unknown[] {
  const raw = decodeJwtPayloadJson(jwt);
  const video = raw.video as Record<string, unknown> | undefined;
  if (!video) return [];
  const s = video.canPublishSources ?? video.can_publish_sources;
  return Array.isArray(s) ? s : [];
}

function jwtSourcesIncludeMicrophone(jwt: string): boolean {
  return canPublishSourcesFromJwt(jwt).some((s) => {
    if (s === TrackSource.MICROPHONE || s === 2) return true;
    if (typeof s === 'string')
      return s.toLowerCase() === 'microphone' || s === 'MICROPHONE';
    return false;
  });
}

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `lk_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
  const email = `${username}@lk.echo.test`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, email, 'LiveKit test', passwordHash],
  );
}

async function grantEveryoneForTests(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_roles
     SET permissions = permissions || '["VIEW_CHANNEL","CONNECT","SEND_MESSAGE"]'::jsonb
     WHERE server_id = $1 AND name = '@everyone'`,
    [serverId],
  );
}

async function run(): Promise<void> {
  // --- Unit tests (no DB needed) ---

  // Room name formatting
  assert.equal(liveKitRoomName('srv_1', 'ch_2'), 'srv_1:ch_2');

  // Room name parsing
  const parsed = parseLiveKitRoomName('srv_1:ch_2');
  assert.deepEqual(parsed, { serverId: 'srv_1', channelId: 'ch_2' });
  assert.equal(parseLiveKitRoomName('no-colon'), null);
  assert.equal(parseLiveKitRoomName(':leading'), null);
  assert.equal(parseLiveKitRoomName('trailing:'), null);

  // UUID-shaped ids
  const uuidParsed = parseLiveKitRoomName(
    'a1b2c3d4-e5f6-4789-abcd-ef0123456789:f9e8d7c6-b5a4-4321-9876-543210fedcba',
  );
  assert.ok(uuidParsed);
  assert.equal(uuidParsed.serverId, 'a1b2c3d4-e5f6-4789-abcd-ef0123456789');
  assert.equal(uuidParsed.channelId, 'f9e8d7c6-b5a4-4321-9876-543210fedcba');

  // Snowflake decimal ids
  const sfParsed = parseLiveKitRoomName(
    '123456789012345678:987654321098765432',
  );
  assert.ok(sfParsed);
  assert.equal(sfParsed.serverId, '123456789012345678');
  assert.equal(sfParsed.channelId, '987654321098765432');

  const rosterDiff = diffEchoVoiceParticipantRosterAgainstLiveKit({
    dbUserIds: ['u1', 'u2', 'u2', ''],
    liveKitIdentities: ['u2', 'u3', 'u3'],
  });
  assert.deepEqual(rosterDiff.dbUserIds, ['u1', 'u2']);
  assert.deepEqual(rosterDiff.liveKitIdentities, ['u2', 'u3']);
  assert.deepEqual(rosterDiff.dbOnlyUserIds, ['u1']);
  assert.deepEqual(rosterDiff.liveKitOnlyUserIds, ['u3']);

  assert.equal(
    pfpForLiveKitParticipantMetadata(
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    ),
    undefined,
    'strip data: URLs from LiveKit metadata',
  );
  assert.equal(
    pfpForLiveKitParticipantMetadata('https://cdn.example.com/a.png'),
    'https://cdn.example.com/a.png',
  );
  assert.equal(
    pfpForLiveKitParticipantMetadata('/uploads/x.webp'),
    '/uploads/x.webp',
  );
  assert.equal(pfpForLiveKitParticipantMetadata('not-a-url'), undefined);

  // Token minting (requires LIVEKIT_API_KEY + LIVEKIT_API_SECRET env)
  if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    const token = await mintJoinToken({
      identity: 'user_123',
      name: 'TestUser',
      roomName: 'srv:ch',
    });
    assert.ok(token.length > 20, 'token looks like a JWT');
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'JWT has 3 parts');
    assert.ok(
      jwtSourcesIncludeMicrophone(token),
      'default join token includes microphone',
    );

    const tokenNoMic = await mintJoinToken({
      identity: 'user_123',
      name: 'TestUser',
      roomName: 'srv:ch',
      canPublishMicrophone: false,
    });
    assert.ok(
      !jwtSourcesIncludeMicrophone(tokenNoMic),
      'canPublishMicrophone:false omits microphone from grant',
    );
    console.log('  mint token: OK');
  } else {
    console.log(
      '  mint token: SKIPPED (LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set)',
    );
  }

  // --- DB integration tests (requires PG_TEST_URL or DATABASE_URL) ---
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping LiveKit DB integration: PG_TEST_URL / DATABASE_URL not set',
    );
    console.log('All LiveKit unit tests passed.');
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ownerId = `lk_owner_${Date.now().toString(36)}`;
  let serverId = '';
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    const created = await createEchoServer(pool, ownerId, 'lk-test');
    serverId = created.serverId;
    await grantEveryoneForTests(pool, serverId);

    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    const categoryId = String(cat.rows[0]!.id);
    const voiceChannelId = await createEchoChannel(
      pool,
      serverId,
      'lk-vc',
      'voice',
      categoryId,
    );
    if (voiceChannelId === 'invalid_category') assert.fail('voice channel');

    // Webhook reconciliation: participant_joined upserts
    const roomName = liveKitRoomName(serverId, voiceChannelId);
    const { serverId: parsedSid, channelId: parsedCid } =
      parseLiveKitRoomName(roomName)!;
    assert.equal(parsedSid, serverId);
    assert.equal(parsedCid, voiceChannelId);

    await pool.query(
      `INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (server_id, user_id) DO UPDATE SET channel_id = $2, joined_at = NOW()`,
      [serverId, voiceChannelId, ownerId],
    );
    const after = await pool.query(
      `SELECT user_id FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2`,
      [serverId, voiceChannelId],
    );
    assert.equal(after.rows.length, 1);
    assert.equal(String(after.rows[0]!.user_id), ownerId);
    console.log('  webhook reconciliation upsert: OK');

    // Webhook reconciliation: participant_left deletes
    await pool.query(
      `DELETE FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
      [serverId, voiceChannelId, ownerId],
    );
    const afterDel = await pool.query(
      `SELECT user_id FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2`,
      [serverId, voiceChannelId],
    );
    assert.equal(afterDel.rows.length, 0);
    console.log('  webhook reconciliation delete: OK');

    const targetId = `lk_target_${Date.now().toString(36)}`;
    await insertAuthUser(pool, targetId);
    await addEchoServerMember(pool, serverId, targetId);
    await pool.query(
      `INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (server_id, user_id) DO UPDATE SET channel_id = $2, joined_at = NOW()`,
      [serverId, voiceChannelId, targetId],
    );
    const muteRes = await applyEchoVoiceModerationAction(
      pool,
      serverId,
      ownerId,
      'server_mute',
      targetId,
    );
    assert.equal(muteRes, 'ok');
    const sm = await pool.query(
      `SELECT server_muted, server_deafened FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetId],
    );
    assert.equal(sm.rows[0]?.server_muted, true);
    assert.equal(sm.rows[0]?.server_deafened, false);

    const deafRes = await applyEchoVoiceModerationAction(
      pool,
      serverId,
      ownerId,
      'server_deafen',
      targetId,
    );
    assert.equal(deafRes, 'ok');
    const sd = await pool.query(
      `SELECT server_muted, server_deafened FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetId],
    );
    assert.equal(sd.rows[0]?.server_deafened, true);
    console.log('  voice server mute/deafen (DB): OK');

    console.log('All LiveKit tests passed.');
  } finally {
    if (serverId) {
      await pool
        .query(`DELETE FROM echo_voice_participants WHERE server_id = $1`, [
          serverId,
        ])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_audit_log WHERE server_id = $1`, [serverId])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_channels WHERE server_id = $1`, [serverId])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_categories WHERE server_id = $1`, [serverId])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_server_members WHERE server_id = $1`, [
          serverId,
        ])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_roles WHERE server_id = $1`, [serverId])
        .catch(() => {});
      await pool
        .query(`DELETE FROM echo_servers WHERE id = $1`, [serverId])
        .catch(() => {});
    }
    await pool.end();
  }
}

run().catch((e) => {
  console.error('LiveKit test failed:', e);
  process.exit(1);
});
