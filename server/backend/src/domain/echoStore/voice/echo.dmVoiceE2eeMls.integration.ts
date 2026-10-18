/**
 * E2E: DM voice LiveKit session mint reports E2EE required without gating on
 * MLS/epochs (Element Call–style media keys are peer-distributed).
 *
 * Run: bun server/backend/src/domain/echoStore/voice/echo.dmVoiceE2eeMls.integration.ts
 */
import assert from 'node:assert/strict';
import { config } from '../../../config';
import { ensureEchoTables } from '../../../db/echoTables';
import { getPgPool } from '../../../db/pg';
import { buildEchoTestApp } from '../../../tests/helpers/echoTestApp';

type Auth = { csrfToken: string; sid: string; userId: string };

async function registerUser(baseUrl: string, username: string): Promise<Auth> {
  const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'DM MediaKey E2E',
    }),
  });
  const regBody = await reg.text();
  assert.equal(reg.status, 201, regBody);
  const auth = JSON.parse(regBody) as {
    csrfToken: string;
    user: { id: string };
  };
  const sid = reg.headers
    .get('set-cookie')
    ?.split(';')
    .find((c) => c.trim().startsWith('echo_sid='))
    ?.split('=')[1];
  assert.ok(sid, 'echo_sid cookie');
  return { csrfToken: auth.csrfToken, sid, userId: auth.user.id };
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
    console.log('SKIP echo.dmVoiceE2eeMls.integration (no DATABASE_URL)');
    return;
  }
  if (!config.liveKitEnabled) {
    console.log(
      'SKIP echo.dmVoiceE2eeMls.integration (LiveKit not configured — set LIVEKIT_API_KEY/SECRET)',
    );
    return;
  }
  if (!config.dmVoiceE2eeEnabled) {
    console.log(
      'SKIP echo.dmVoiceE2eeMls.integration (ECHO_DM_VOICE_E2EE_ENABLED is off)',
    );
    return;
  }

  await ensureEchoTables(pool);
  const { baseUrl, close } = await buildEchoTestApp();
  const stamp = Date.now().toString(36);

  try {
    const a = await registerUser(baseUrl, `dmkey_a_${stamp}`);
    const b = await registerUser(baseUrl, `dmkey_b_${stamp}`);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: authHeaders(a),
      body: JSON.stringify({ name: 'DM MediaKey Shared' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };
    await pool.query(
      `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [serverId, b.userId],
    );

    const open = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: authHeaders(a),
      body: JSON.stringify({ peerUserId: b.userId }),
    });
    const openBody = await open.text();
    assert.equal(open.status, 200, openBody);
    const { channelId } = JSON.parse(openBody) as { channelId: string };
    assert.ok(channelId?.trim(), 'dm channelId');

    // Mint must succeed without MLS/epoch prepare — keys are peer-distributed.
    const mintA = await fetch(
      `${baseUrl}/api/v1/echo/dm/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
      { method: 'POST', headers: authHeaders(a), body: '{}' },
    );
    const mintABody = await mintA.text();
    assert.equal(mintA.status, 200, mintABody);
    const sessionA = JSON.parse(mintABody) as {
      token?: string;
      url?: string;
      roomName?: string;
      voiceE2ee?: { required?: boolean; epochId?: string | null };
    };
    assert.ok(sessionA.token?.trim(), 'caller livekit token');
    assert.ok(sessionA.url?.trim(), 'caller livekit url');
    assert.equal(sessionA.voiceE2ee?.required, true);
    assert.equal(sessionA.voiceE2ee?.epochId ?? null, null);

    const mintB = await fetch(
      `${baseUrl}/api/v1/echo/dm/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
      { method: 'POST', headers: authHeaders(b), body: '{}' },
    );
    const mintBBody = await mintB.text();
    assert.equal(mintB.status, 200, mintBBody);
    const sessionB = JSON.parse(mintBBody) as {
      token?: string;
      roomName?: string;
      voiceE2ee?: { required?: boolean };
    };
    assert.ok(sessionB.token?.trim(), 'callee livekit token');
    assert.equal(sessionB.voiceE2ee?.required, true);
    assert.equal(sessionA.roomName, sessionB.roomName);

    console.log('OK echo.dmVoiceE2eeMls.integration');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
