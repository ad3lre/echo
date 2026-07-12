/**
 * Regression: stale LiveKit room_finished must not wipe MLS state while a new
 * joiner holds a REST voice-participant row (E2EE prepare / session mint).
 *
 * Run: node --import tsx backend/src/tests/echo.voiceE2eeRoomFinished.integration.ts
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import { getPgPool } from '../db/pg';
import {
  getMlsGroupInfo,
  initMlsGroupIfAbsent,
  resetMlsGroupForChannel,
} from '../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `rff_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
  const email = `${username}@rff.echo.test`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, email, 'room_finished regression', passwordHash],
  );
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log(
      'SKIP echo.voiceE2eeRoomFinished.integration (no DATABASE_URL)',
    );
    return;
  }

  await ensureEchoTables(pool);
  const ownerId = `rff_owner_${Date.now().toString(36)}`;
  await insertAuthUser(pool, ownerId);
  const serverId = `srv_${Date.now().toString(36)}`;
  const channelId = `ch_${Date.now().toString(36)}`;

  await pool.query(
    `INSERT INTO echo_servers (id, name, owner_id) VALUES ($1, 'rff', $2)`,
    [serverId, ownerId],
  );
  await pool.query(
    `INSERT INTO echo_channels (id, server_id, name, type, position, voice_e2ee_enabled)
     VALUES ($1, $2, 'e2ee', 'voice', 0, TRUE)`,
    [channelId, serverId],
  );
  await pool.query(
    `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2)`,
    [serverId, ownerId],
  );
  await pool.query(
    `INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
     VALUES ($1, $2, $3)`,
    [serverId, channelId, ownerId],
  );

  const init = await initMlsGroupIfAbsent(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    groupInfo: 'opaque-group-info-rff',
  });
  assert.ok(init.ok, `MLS init failed: ${JSON.stringify(init)}`);

  const before = await getMlsGroupInfo(pool, serverId, channelId);
  assert.ok(before?.groupInfo, 'MLS group should exist after init');

  const remaining = await pool.query(
    `SELECT 1 FROM echo_voice_participants
     WHERE server_id = $1 AND channel_id = $2 LIMIT 1`,
    [serverId, channelId],
  );
  assert.ok(
    remaining.rows.length > 0,
    'REST participant row simulates mid-join',
  );

  // room_finished handler must skip purge when participants remain — do not reset.
  const afterSkip = await getMlsGroupInfo(pool, serverId, channelId);
  assert.ok(
    afterSkip?.groupInfo,
    'MLS group must survive while participants remain',
  );

  await pool.query(
    `DELETE FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  await resetMlsGroupForChannel(pool, serverId, channelId);
  const afterReset = await getMlsGroupInfo(pool, serverId, channelId);
  assert.equal(afterReset, null, 'MLS group cleared after channel fully empty');

  console.log('PASS echo.voiceE2eeRoomFinished.integration');
  await pool.end();
}

main().catch((e) => {
  console.error('FAIL echo.voiceE2eeRoomFinished.integration', e);
  process.exit(1);
});
