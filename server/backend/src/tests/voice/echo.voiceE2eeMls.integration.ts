/**
 * E2E: guild voice E2EE session mint accepts an MLS group (v2) and rejects
 * legacy-only state without MLS init.
 *
 * Run: node --import tsx server/backend/src/tests/voice/echo.voiceE2eeMls.integration.ts
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type pg from 'pg';
import { config } from '../../config';
import { ensureEchoTables } from '../../db/echoTables';
import { getPgPool } from '../../db/pg';
import {
  createEchoChannel,
  createEchoServer,
  createVoiceE2eeEpochWithEnvelopes,
  getActiveVoiceE2eeEpoch,
  getMlsGroupInfo,
  initMlsGroupIfAbsent,
  supersedeVoiceE2eeEpochsForChannel,
} from '../../domain/echoStore';
import { upsertEchoE2eeDevice } from '../../domain/echoStore/voice/e2ee';
import { buildEchoTestApp } from '../helpers/echoTestApp';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `ve2mls_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
  const email = `${username}@ve2mls.echo.test`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, email, 'Voice MLS E2E', passwordHash],
  );
}

async function grantEveryoneForTests(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_roles
     SET permissions = permissions || '["VIEW_CHANNEL","CONNECT","SEND_MESSAGE"]'::jsonb
     WHERE server_id = $1`,
    [serverId],
  );
}

type Auth = { csrfToken: string; sid: string };

async function registerUser(baseUrl: string, username: string): Promise<Auth> {
  const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'Voice MLS E2E',
    }),
  });
  const regBody = await reg.text();
  assert.equal(reg.status, 201, regBody);
  const auth = JSON.parse(regBody) as { csrfToken: string };
  const sid = reg.headers
    .get('set-cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('echo_sid='))
    ?.split('=')[1];
  assert.ok(sid, 'echo_sid cookie');
  return { csrfToken: auth.csrfToken, sid };
}

function authHeaders(auth: Auth): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': auth.csrfToken,
    cookie: `echo_sid=${auth.sid}`,
  };
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('SKIP echo.voiceE2eeMls.integration (no DATABASE_URL)');
    return;
  }
  if (!config.liveKitEnabled) {
    console.log(
      'SKIP echo.voiceE2eeMls.integration (LiveKit not configured — set LIVEKIT_API_KEY/SECRET)',
    );
    return;
  }

  await ensureEchoTables(pool);
  const { baseUrl, close } = await buildEchoTestApp();
  const username = `ve2mls_${Date.now().toString(36)}`;

  try {
    const auth = await registerUser(baseUrl, username);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify({ name: 'Voice MLS E2E Server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const chList = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      { headers: { cookie: `echo_sid=${auth.sid}` } },
    );
    const chListBody = await chList.text();
    assert.equal(chList.status, 200, chListBody);
    const channels = (
      JSON.parse(chListBody) as {
        channels: { id: string; type: string; categoryId: string }[];
      }
    ).channels;
    const voiceCategoryId = channels.find(
      (c) => c.type === 'voice',
    )?.categoryId;
    assert.ok(voiceCategoryId, 'voice category');

    const cr = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify({
          name: 'encrypted-vc',
          type: 'voice',
          categoryId: voiceCategoryId,
        }),
      },
    );
    const crBody = await cr.text();
    assert.equal(cr.status, 201, crBody);
    const { channelId } = JSON.parse(crBody) as { channelId: string };

    const patch = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(channelId)}`,
      {
        method: 'PATCH',
        headers: authHeaders(auth),
        body: JSON.stringify({ voiceE2eeEnabled: true }),
      },
    );
    const patchBody = await patch.text();
    assert.ok(patch.status === 200 || patch.status === 204, patchBody);

    const join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/join`,
      { method: 'POST', headers: authHeaders(auth), body: '{}' },
    );
    assert.equal(join.status, 204, await join.text());

    const mintBefore = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
      { method: 'POST', headers: authHeaders(auth), body: '{}' },
    );
    const mintBeforeBody = await mintBefore.text();
    assert.equal(mintBefore.status, 409, mintBeforeBody);
    const beforeJson = JSON.parse(mintBeforeBody) as { code?: string };
    assert.equal(beforeJson.code, 'VOICE_E2EE_EPOCH_REQUIRED');

    const mlsInit = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/mls/init`,
      {
        method: 'POST',
        headers: authHeaders(auth),
        body: JSON.stringify({ groupInfo: 'opaque-group-info-e2e' }),
      },
    );
    const mlsInitBody = await mlsInit.text();
    assert.equal(mlsInit.status, 200, mlsInitBody);
    const initJson = JSON.parse(mlsInitBody) as { created?: boolean };
    assert.equal(initJson.created, true);

    const joinAgain = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/join`,
      { method: 'POST', headers: authHeaders(auth), body: '{}' },
    );
    assert.equal(joinAgain.status, 204, await joinAgain.text());

    const mintAfter = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
      { method: 'POST', headers: authHeaders(auth), body: '{}' },
    );
    const mintAfterBody = await mintAfter.text();
    assert.equal(mintAfter.status, 200, mintAfterBody);
    const afterJson = JSON.parse(mintAfterBody) as {
      token?: string;
      url?: string;
      roomName?: string;
    };
    assert.ok(afterJson.token?.trim(), 'livekit token');
    assert.ok(afterJson.url?.trim(), 'livekit url');

    // Stale legacy v1 epoch must not block mint once MLS group exists.
    const ownerId = `ve2mls_owner_${Date.now().toString(36)}`;
    const peerId = `ve2mls_peer_${Date.now().toString(36)}`;
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, peerId);
    const created = await createEchoServer(pool, ownerId, 've2mls-stale');
    const staleServerId = created.serverId;
    await grantEveryoneForTests(pool, staleServerId);
    await pool.query(
      `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [staleServerId, peerId],
    );
    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [staleServerId],
    );
    const staleChannelId = await createEchoChannel(
      pool,
      staleServerId,
      'stale-vc',
      'voice',
      String(cat.rows[0]!.id),
    );
    assert.notEqual(staleChannelId, 'invalid_category');
    await pool.query(
      `UPDATE echo_channels SET voice_e2ee_enabled = TRUE WHERE id = $1`,
      [staleChannelId],
    );
    await pool.query(
      `INSERT INTO echo_voice_participants (server_id, channel_id, user_id) VALUES ($1, $2, $3)`,
      [staleServerId, staleChannelId, ownerId],
    );
    await upsertEchoE2eeDevice(pool, peerId, {
      deviceId: `dev-${peerId}`,
      identityKey: 'ik-peer',
      registrationId: 1,
    });
    const epochRes = await createVoiceE2eeEpochWithEnvelopes(pool, {
      serverId: staleServerId,
      channelId: staleChannelId,
      actorUserId: ownerId,
      epochId: crypto.randomUUID(),
      roomName: `${staleServerId}:${staleChannelId}`,
      envelopes: [],
    });
    assert.equal(epochRes, 'ok');
    assert.ok(
      await getActiveVoiceE2eeEpoch(pool, staleServerId, staleChannelId),
    );

    const staleInit = await initMlsGroupIfAbsent(pool, {
      serverId: staleServerId,
      channelId: staleChannelId,
      actorUserId: ownerId,
      groupInfo: 'opaque-stale-handoff',
    });
    assert.ok(staleInit.ok && staleInit.created, 'MLS init on stale channel');
    assert.equal(
      await getActiveVoiceE2eeEpoch(pool, staleServerId, staleChannelId),
      null,
      'v1 epoch superseded on MLS init',
    );
    assert.ok(
      await getMlsGroupInfo(pool, staleServerId, staleChannelId),
      'MLS group present',
    );

    await supersedeVoiceE2eeEpochsForChannel(
      pool,
      staleServerId,
      staleChannelId,
    );

    console.log('PASS echo.voiceE2eeMls.integration');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
