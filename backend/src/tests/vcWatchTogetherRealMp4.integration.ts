/**
 * Watch Together upload + HLS poll with a real short MP4.
 * Run: node --import tsx backend/src/tests/vcWatchTogetherRealMp4.integration.ts [path/to/file.mp4]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MP4 = '/tmp/echo-wt-e2e/sample.mp4';

function parseSid(setCookie: string | null): string | undefined {
  return setCookie
    ?.split(';')
    .find((c) => c.trim().startsWith('echo_sid='))
    ?.split('=')[1];
}

async function registerUser(
  baseUrl: string,
  username: string,
): Promise<{ sid: string; csrfToken: string }> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'WT Real MP4',
    }),
  });
  const body = await res.text();
  assert.equal(res.status, 201, body);
  const json = JSON.parse(body) as { csrfToken: string };
  const sid = parseSid(res.headers.get('set-cookie'));
  assert.ok(sid, 'expected echo_sid cookie');
  return { sid, csrfToken: json.csrfToken };
}

async function postJson(
  baseUrl: string,
  apiPath: string,
  sid: string,
  csrfToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${baseUrl}/api/v1/echo${apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: `echo_sid=${sid}`,
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

async function fingerprintVideo(buf: Buffer): Promise<{
  sha256Hex: string;
  phashHex: string;
}> {
  const sha256Hex = createHash('sha256').update(buf).digest('hex');
  return { sha256Hex, phashHex: '0'.repeat(64) };
}

async function run(): Promise<void> {
  const mp4Path = path.resolve(process.argv[2] ?? DEFAULT_MP4);
  const fileBytes = await fs.readFile(mp4Path);
  assert.ok(fileBytes.length > 1000, `MP4 too small: ${mp4Path}`);

  const { getEchoStore, createEchoChannel } =
    await import('../domain/echoStore');
  const { buildEchoTestApp } = await import('./helpers/echoTestApp');

  let storeState: Awaited<ReturnType<typeof getEchoStore>>;
  try {
    storeState = await getEchoStore();
  } catch {
    console.log(
      'vcWatchTogetherRealMp4.integration: skip (postgres unavailable)',
    );
    return;
  }
  if (!storeState.enabled || !storeState.pool) {
    console.log('vcWatchTogetherRealMp4.integration: skip (no DATABASE_URL)');
    return;
  }

  process.env.ECHO_LOCAL_UPLOAD_DIR =
    process.env.ECHO_LOCAL_UPLOAD_DIR ??
    path.join(path.dirname(mp4Path), 'uploads');
  await fs.mkdir(process.env.ECHO_LOCAL_UPLOAD_DIR, { recursive: true });

  const { baseUrl, close } = await buildEchoTestApp();
  const pool = storeState.pool;
  const tag = Date.now().toString(36);

  try {
    const host = await registerUser(baseUrl, `wt_mp4_${tag}`);
    await pool.query(
      `UPDATE auth_users SET echo_plan = 'plus' WHERE username = $1`,
      [`wt_mp4_${tag}`],
    );

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': host.csrfToken,
        cookie: `echo_sid=${host.sid}`,
      },
      body: JSON.stringify({ name: `WT MP4 ${tag}` }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    const channelId = await createEchoChannel(
      pool,
      serverId,
      'vc',
      'voice',
      String(cat.rows[0]!.id),
    );
    assert.notEqual(channelId, 'invalid_category');

    const sessionId = `wt-mp4-${tag}`;
    const { sha256Hex, phashHex } = await fingerprintVideo(fileBytes);

    const presign = await postJson(
      baseUrl,
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
    );
    assert.equal(presign.status, 200, presign.text);
    assert.equal(presign.json.uploadMode, 'local');

    const uploadUrl = String(presign.json.uploadUrl);
    const authHeader =
      (presign.json.headers as Record<string, string> | undefined)
        ?.Authorization ?? '';
    const putRes = await fetch(`${baseUrl}${uploadUrl}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        Authorization: authHeader,
        cookie: `echo_sid=${host.sid}`,
      },
      body: fileBytes,
    });
    assert.equal(putRes.status, 204, await putRes.text());

    const register = await postJson(
      baseUrl,
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
        phashHex,
        kind: 'video',
        byteLength: fileBytes.length,
      },
    );
    assert.equal(register.status, 204, register.text);

    const publicUrl = String(presign.json.publicUrl);
    let lastStatus = 'pending';
    let lastError = '';
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const playback = await fetch(
        `${baseUrl}/api/v1/echo/uploads/video-playback?url=${encodeURIComponent(publicUrl)}`,
        { headers: { cookie: `echo_sid=${host.sid}` } },
      );
      const playbackText = await playback.text();
      assert.equal(playback.status, 200, playbackText);
      const playbackJson = JSON.parse(playbackText) as {
        status?: string;
        lastError?: string;
        hlsManifestUrl?: string | null;
      };
      lastStatus = playbackJson.status ?? 'unknown';
      lastError = playbackJson.lastError?.trim() ?? '';
      if (lastStatus === 'ready') {
        assert.ok(
          playbackJson.hlsManifestUrl,
          'expected hlsManifestUrl when ready',
        );
        console.log(
          `vcWatchTogetherRealMp4.integration: ok (${fileBytes.length} bytes, hls ready)`,
        );
        return;
      }
      if (lastStatus === 'failed') {
        console.log(
          `vcWatchTogetherRealMp4.integration: transcode failed — ${lastError || 'no detail'}`,
        );
        process.exitCode = 1;
        return;
      }
    }
    console.log(
      `vcWatchTogetherRealMp4.integration: timeout after 120s (last status=${lastStatus})`,
    );
    process.exitCode = 1;
  } finally {
    await close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
