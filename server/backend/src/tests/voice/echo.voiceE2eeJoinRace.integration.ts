/**
 * Regression: stale LiveKit `room_finished` during guild E2EE join must not
 * wipe MLS state / REST participant rows — session mint must succeed (no 409).
 *
 * Run: node --import tsx server/backend/src/tests/voice/echo.voiceE2eeJoinRace.integration.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { config } from '../../config';
import { ensureEchoTables } from '../../db/echoTables';
import { getPgPool } from '../../db/pg';
import { getMlsGroupInfo } from '../../domain/echoStore';
import { liveKitRoomName } from '../../services/livekit/livekitAdapter';
import { buildEchoTestApp } from '../helpers/echoTestApp';

function authHeaders(auth: { csrfToken: string; sid: string }) {
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': auth.csrfToken,
    cookie: `echo_sid=${auth.sid}`,
  };
}

async function registerUser(baseUrl: string, username: string) {
  const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'Voice E2EE race',
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

async function signLiveKitWebhook(body: string): Promise<string> {
  const hash = createHash('sha256').update(body).digest('base64');
  const token = new AccessToken(config.liveKitApiKey, config.liveKitApiSecret);
  token.sha256 = hash;
  return token.toJwt();
}

async function postRoomFinishedWebhook(
  baseUrl: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  const body = JSON.stringify({
    event: 'room_finished',
    room: { name: liveKitRoomName(serverId, channelId) },
  });
  const auth = await signLiveKitWebhook(body);
  const res = await fetch(`${baseUrl}/api/v1/hooks/livekit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/webhook+json',
      authorization: auth,
    },
    body,
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('SKIP echo.voiceE2eeJoinRace.integration (no DATABASE_URL)');
    return;
  }
  if (!config.liveKitEnabled) {
    console.log(
      'SKIP echo.voiceE2eeJoinRace.integration (LiveKit not configured)',
    );
    return;
  }

  await ensureEchoTables(pool);
  const { baseUrl, close } = await buildEchoTestApp();
  const username = `ve2race_${Date.now().toString(36)}`;

  try {
    const auth = await registerUser(baseUrl, username);
    const headers = authHeaders(auth);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'E2EE race server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const chList = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      { headers: { cookie: `echo_sid=${auth.sid}` } },
    );
    const channels = (
      JSON.parse(await chList.text()) as {
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
        headers,
        body: JSON.stringify({
          name: 'encrypted-vc-race',
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
        headers,
        body: JSON.stringify({ voiceE2eeEnabled: true }),
      },
    );
    assert.ok(patch.status === 200 || patch.status === 204, await patch.text());

    const join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/join`,
      { method: 'POST', headers, body: '{}' },
    );
    assert.equal(join.status, 204, await join.text());

    const mlsInit = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/mls/init`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ groupInfo: 'opaque-group-info-race' }),
      },
    );
    const mlsInitBody = await mlsInit.text();
    assert.equal(mlsInit.status, 200, mlsInitBody);

    const beforeWebhook = await getMlsGroupInfo(pool, serverId, channelId);
    assert.ok(beforeWebhook?.groupInfo, 'MLS group exists before webhook');

    // Stale room_finished from a prior empty call races mid-join.
    await postRoomFinishedWebhook(baseUrl, serverId, channelId);

    const afterWebhook = await getMlsGroupInfo(pool, serverId, channelId);
    assert.ok(
      afterWebhook?.groupInfo,
      'MLS group must survive room_finished while REST participant row exists',
    );

    const mint = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
      { method: 'POST', headers, body: '{}' },
    );
    const mintBody = await mint.text();
    assert.equal(
      mint.status,
      200,
      `expected session mint 200, got ${mint.status}: ${mintBody}`,
    );
    const session = JSON.parse(mintBody) as {
      voiceE2ee?: { required?: boolean };
    };
    assert.equal(session.voiceE2ee?.required, true);

    console.log('PASS echo.voiceE2eeJoinRace.integration');
  } finally {
    await close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAIL echo.voiceE2eeJoinRace.integration', e);
  process.exit(1);
});
