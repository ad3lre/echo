/**
 * Voice E2EE store + route behavior (epoch create, envelope gate, concurrency).
 * Run: node --import tsx backend/src/tests/echo.voiceE2ee.test.ts
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import { getPgPool } from '../db/pg';
import {
  createEchoChannel,
  createEchoServer,
  createVoiceE2eeEpochWithEnvelopes,
  getActiveVoiceE2eeEpoch,
  supersedeVoiceE2eeEpochsForChannel,
  userHasVoiceE2eeEnvelopeForJoin,
} from '../domain/echoStore';
import { upsertEchoE2eeDevice } from '../domain/echoStore/e2ee';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `ve2ee_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
  const email = `${username}@ve2ee.echo.test`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, email, 'Voice E2EE test', passwordHash],
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

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('SKIP echo.voiceE2ee.test (no DATABASE_URL)');
    return;
  }
  await ensureEchoTables(pool);

  const ownerId = `ve2ee_owner_${Date.now().toString(36)}`;
  const peerId = `ve2ee_peer_${Date.now().toString(36)}`;
  await insertAuthUser(pool, ownerId);
  await insertAuthUser(pool, peerId);

  const created = await createEchoServer(pool, ownerId, 've2ee-srv');
  const serverId = created.serverId;
  await grantEveryoneForTests(pool, serverId);
  await pool.query(
    `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [serverId, peerId],
  );

  const cat = await pool.query(
    `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const categoryId = String(cat.rows[0]!.id);
  const channelId = await createEchoChannel(
    pool,
    serverId,
    've2ee-vc',
    'voice',
    categoryId,
  );
  assert.notEqual(channelId, 'invalid_category');
  await pool.query(
    `UPDATE echo_channels SET voice_e2ee_enabled = TRUE WHERE id = $1`,
    [channelId],
  );

  await pool.query(
    `INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
     VALUES ($1, $2, $3)`,
    [serverId, channelId, ownerId],
  );

  const epochId = crypto.randomUUID();
  const devPeer = `dev-${peerId}`;
  await upsertEchoE2eeDevice(pool, peerId, {
    deviceId: devPeer,
    identityKey: 'ik',
    registrationId: 1,
  });

  const noInVoice = await createVoiceE2eeEpochWithEnvelopes(pool, {
    serverId,
    channelId,
    actorUserId: peerId,
    epochId: crypto.randomUUID(),
    envelopes: [],
  });
  assert.equal(noInVoice, 'not_in_voice');

  const createdEpoch = await createVoiceE2eeEpochWithEnvelopes(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    epochId,
    envelopes: [
      {
        recipientUserId: peerId,
        recipientDeviceId: devPeer,
        ciphertext: 'opaque-ciphertext-placeholder',
      },
    ],
  });
  assert.equal(createdEpoch, 'ok');

  const active = await getActiveVoiceE2eeEpoch(pool, serverId, channelId);
  assert.equal(active?.id, epochId);

  const hasAny = await userHasVoiceE2eeEnvelopeForJoin(
    pool,
    epochId,
    peerId,
    null,
  );
  assert.equal(hasAny, true);

  const hasDevice = await userHasVoiceE2eeEnvelopeForJoin(
    pool,
    epochId,
    peerId,
    devPeer,
  );
  assert.equal(hasDevice, true);

  const missingDevice = await userHasVoiceE2eeEnvelopeForJoin(
    pool,
    epochId,
    peerId,
    'wrong-device-id',
  );
  assert.equal(missingDevice, false);

  const epochDup = crypto.randomUUID();
  const roomName = `${serverId}:${channelId}`;
  let duplicateBlocked = false;
  try {
    await pool.query(
      `
      INSERT INTO echo_voice_e2ee_epochs (
        id, server_id, channel_id, room_name, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5)
      `,
      [epochDup, serverId, channelId, roomName, ownerId],
    );
    duplicateBlocked = false;
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    duplicateBlocked = code === '23505';
  }
  assert.equal(duplicateBlocked, true, 'unique one-active epoch index');

  await supersedeVoiceE2eeEpochsForChannel(pool, serverId, channelId);
  const after = await getActiveVoiceE2eeEpoch(pool, serverId, channelId);
  assert.equal(after, null);

  console.log('  voice E2EE epoch create + envelope gate: OK');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
