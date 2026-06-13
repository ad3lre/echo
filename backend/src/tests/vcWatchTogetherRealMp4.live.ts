/**
 * Watch Together upload + HLS poll against live backend (:3000) with a real MP4.
 * Run: node --import tsx backend/src/tests/vcWatchTogetherRealMp4.live.ts [mp4-path]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.ECHO_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const DEFAULT_MP4 = '/tmp/echo-wt-e2e/sample.mp4';

function parseCookieValue(
  setCookie: string | null,
  name: string,
): string | undefined {
  const re = new RegExp(`(?:__Host-)?${name}=([^;]+)`);
  const match = setCookie?.match(re);
  return match?.[1]?.trim();
}

function parseSid(setCookie: string | null): string | undefined {
  return parseCookieValue(setCookie, 'echo_sid');
}

function parseCsrfCookie(setCookie: string | null): string | undefined {
  return parseCookieValue(setCookie, 'echo_csrf');
}

function sessionCookieHeader(sid: string, csrfCookie?: string): string {
  const parts = [`__Host-echo_sid=${sid}`];
  if (csrfCookie) parts.push(`__Host-echo_csrf=${csrfCookie}`);
  return parts.join('; ');
}

async function registerUser(username: string): Promise<{
  sid: string;
  csrfToken: string;
  csrfCookie?: string;
  userId: string;
}> {
  const res = await fetch(`${BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'WT Real MP4 Live',
    }),
  });
  const body = await res.text();
  assert.equal(res.status, 201, body);
  const json = JSON.parse(body) as {
    csrfToken: string;
    user: { id: string };
  };
  const setCookie =
    res.headers.get('set-cookie') ??
    (typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie().join('; ')
      : null);
  const sid = parseSid(setCookie);
  const csrfCookie = parseCsrfCookie(setCookie);
  assert.ok(sid, 'expected echo_sid cookie');
  return { sid, csrfToken: json.csrfToken, csrfCookie, userId: json.user.id };
}

async function postJson(
  apiPath: string,
  sid: string,
  csrfToken: string,
  body: Record<string, unknown>,
  csrfCookie?: string,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${BASE}/api/v1/echo${apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: sessionCookieHeader(sid, csrfCookie),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }
  return { status: res.status, json, text };
}

async function run(): Promise<void> {
  const mp4Path = path.resolve(process.argv[2] ?? DEFAULT_MP4);
  const fileBytes = await fs.readFile(mp4Path);
  assert.ok(fileBytes.length > 1000, `MP4 too small: ${mp4Path}`);
  console.log(`Using ${mp4Path} (${fileBytes.length} bytes) against ${BASE}`);

  const mod = await import('../domain/echoStore');
  const getEchoStore = mod.getEchoStore ?? mod.default?.getEchoStore;
  const store = await getEchoStore();
  if (!store.pool) {
    console.log('skip: no DATABASE_URL');
    return;
  }
  const pool = store.pool;
  const tag = Date.now().toString(36);
  const host = await registerUser(`wt_live_${tag}`);
  await pool.query(`UPDATE auth_users SET echo_plan = 'plus' WHERE id = $1`, [
    host.userId,
  ]);

  const ch = await pool.query(
    `SELECT id, server_id FROM echo_channels WHERE name = 'vc' AND type = 'voice' LIMIT 1`,
  );
  const channelId = String(ch.rows[0]?.id ?? '');
  const serverId = String(ch.rows[0]?.server_id ?? '');
  assert.ok(channelId && serverId, 'no vc channel in DB');
  await pool.query(
    `INSERT INTO echo_server_members (server_id, user_id, joined_at)
     VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [serverId, host.userId],
  );

  const sessionId = `wt-live-${tag}`;
  const sha256Hex = createHash('sha256').update(fileBytes).digest('hex');

  const presign = await postJson(
    '/uploads/presign',
    host.sid,
    host.csrfToken,
    {
      channelId,
      purpose: 'vc_watch_together',
      sessionId,
      key: 'sample.mp4',
      contentType: 'video/mp4',
      contentLength: fileBytes.length,
    },
    host.csrfCookie,
  );
  assert.equal(presign.status, 200, presign.text);

  const uploadUrl = String(presign.json.uploadUrl);
  const authHeader =
    (presign.json.headers as Record<string, string> | undefined)
      ?.Authorization ?? '';
  const putRes = await fetch(`${BASE}${uploadUrl}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      Authorization: authHeader,
      cookie: sessionCookieHeader(host.sid, host.csrfCookie),
    },
    body: fileBytes,
  });
  assert.equal(putRes.status, 204, await putRes.text());

  const register = await postJson(
    '/uploads/dedupe/register',
    host.sid,
    host.csrfToken,
    {
      channelId,
      purpose: 'vc_watch_together',
      sessionId,
      contentType: 'video/mp4',
      objectKey: 'sample.mp4',
      storageKey: presign.json.key,
      publicUrl: presign.json.publicUrl,
      sha256Hex,
      phashHex: '0'.repeat(64),
      kind: 'video',
      byteLength: fileBytes.length,
    },
    host.csrfCookie,
  );
  assert.equal(register.status, 204, register.text);
  console.log('upload+register ok, polling transcode…');

  const publicUrl = String(presign.json.publicUrl);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const playback = await fetch(
      `${BASE}/api/v1/echo/uploads/video-playback?url=${encodeURIComponent(publicUrl)}`,
      { headers: { cookie: sessionCookieHeader(host.sid, host.csrfCookie) } },
    );
    const playbackText = await playback.text();
    assert.equal(playback.status, 200, playbackText);
    const j = JSON.parse(playbackText) as {
      status?: string;
      lastError?: string;
      hlsManifestUrl?: string | null;
    };
    process.stdout.write(`  [${i + 1}] status=${j.status}\n`);
    if (j.status === 'ready') {
      console.log(`vcWatchTogetherRealMp4.live: ok hls=${j.hlsManifestUrl}`);
      return;
    }
    if (j.status === 'failed') {
      console.error(
        `vcWatchTogetherRealMp4.live: failed — ${j.lastError ?? 'unknown'}`,
      );
      process.exitCode = 1;
      return;
    }
  }
  console.error('vcWatchTogetherRealMp4.live: timeout');
  process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
