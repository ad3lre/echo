/**
 * Watch Together upload + session quota HTTP integration (requires DATABASE_URL).
 * Run: node --import tsx backend/src/tests/vcWatchTogetherE2e.integration.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function clearConfigModules(): void {
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}backend${path.sep}src${path.sep}config`)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

function parseSid(setCookie: string | null): string | undefined {
  return setCookie
    ?.split(';')
    .find((c) => c.trim().startsWith('echo_sid='))
    ?.split('=')[1];
}

async function registerUser(
  baseUrl: string,
  username: string,
): Promise<{ userId: string; sid: string; csrfToken: string }> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: 'WT E2E',
    }),
  });
  const body = await res.text();
  assert.equal(res.status, 201, body);
  const json = JSON.parse(body) as {
    user: { id: string };
    csrfToken: string;
  };
  const sid = parseSid(res.headers.get('set-cookie'));
  assert.ok(sid, 'expected echo_sid cookie');
  return { userId: json.user.id, sid, csrfToken: json.csrfToken };
}

async function postJson(
  baseUrl: string,
  path: string,
  sid: string,
  csrfToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${baseUrl}/api/v1/echo${path}`, {
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

/** Minimal ISO BMFF shell sufficient for presign/register (transcode may still fail). */
function minimalMp4Bytes(): Buffer {
  // ftyp + empty mdat — enough for content-type / size checks
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x00, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ]);
  const mdat = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74]);
  return Buffer.concat([ftyp, mdat]);
}

async function run(): Promise<void> {
  const uploadRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'echo-wt-e2e-uploads-'),
  );
  process.env.ECHO_LOCAL_UPLOAD_DIR = uploadRoot;
  clearConfigModules();

  const { getEchoStore, createEchoChannel } =
    await import('../domain/echoStore');
  const { buildEchoTestApp } = await import('./helpers/echoTestApp');

  let storeState: Awaited<ReturnType<typeof getEchoStore>>;
  try {
    storeState = await getEchoStore();
  } catch {
    console.log('vcWatchTogetherE2e.integration: skip (postgres unavailable)');
    return;
  }
  if (!storeState.enabled || !storeState.pool) {
    console.log('vcWatchTogetherE2e.integration: skip (no DATABASE_URL)');
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const pool = storeState.pool;
  const tag = Date.now().toString(36);

  try {
    const host = await registerUser(baseUrl, `wt_host_${tag}`);
    const free = await registerUser(baseUrl, `wt_free_${tag}`);
    const intruder = await registerUser(baseUrl, `wt_intr_${tag}`);

    await pool.query(`UPDATE auth_users SET echo_plan = 'plus' WHERE id = $1`, [
      host.userId,
    ]);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': host.csrfToken,
        cookie: `echo_sid=${host.sid}`,
      },
      body: JSON.stringify({ name: `WT E2E ${tag}` }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId } = JSON.parse(srvBody) as { serverId: string };

    const cat = await pool.query(
      `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    const categoryId = String(cat.rows[0]!.id);
    const channelId = await createEchoChannel(
      pool,
      serverId,
      'vc',
      'voice',
      categoryId,
    );
    assert.notEqual(channelId, 'invalid_category');
    const sessionId = `wt-sess-${tag}`;
    const fileBytes = minimalMp4Bytes();
    const sha256Hex = createHash('sha256').update(fileBytes).digest('hex');

    const freePresign = await postJson(
      baseUrl,
      '/uploads/presign',
      free.sid,
      free.csrfToken,
      {
        channelId,
        purpose: 'vc_watch_together',
        sessionId,
        key: 'clip.mp4',
        contentType: 'video/mp4',
        contentLength: fileBytes.length,
      },
    );
    assert.equal(freePresign.status, 403);
    assert.equal(freePresign.json.code, 'ECHO_PLUS_REQUIRED');

    const presign = await postJson(
      baseUrl,
      '/uploads/presign',
      host.sid,
      host.csrfToken,
      {
        channelId,
        purpose: 'vc_watch_together',
        sessionId,
        key: 'clip.mp4',
        contentType: 'video/mp4',
        contentLength: fileBytes.length,
      },
    );
    assert.equal(presign.status, 200, presign.text);
    assert.equal(presign.json.uploadMode, 'local');
    assert.equal(typeof presign.json.key, 'string');
    assert.equal(typeof presign.json.uploadUrl, 'string');

    const uploadUrl = String(presign.json.uploadUrl);
    const authHeader =
      (presign.json.headers as Record<string, string> | undefined)
        ?.Authorization ?? '';
    assert.ok(authHeader.startsWith('Bearer '), 'expected upload bearer token');

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
        objectKey: 'clip.mp4',
        storageKey: presign.json.key,
        publicUrl: presign.json.publicUrl,
        sha256Hex,
        phashHex: '0'.repeat(64),
        kind: 'video',
        byteLength: fileBytes.length,
      },
    );
    assert.equal(register.status, 204, register.text);

    const playback = await fetch(
      `${baseUrl}/api/v1/echo/uploads/video-playback?url=${encodeURIComponent(String(presign.json.publicUrl))}`,
      {
        headers: {
          cookie: `echo_sid=${host.sid}`,
        },
      },
    );
    const playbackText = await playback.text();
    assert.equal(playback.status, 200, playbackText);
    const playbackJson = JSON.parse(playbackText) as { status?: string };
    assert.ok(
      playbackJson.status === 'pending' ||
        playbackJson.status === 'processing' ||
        playbackJson.status === 'ready' ||
        playbackJson.status === 'failed',
    );

    const releaseDenied = await postJson(
      baseUrl,
      '/uploads/vc-watch-together/release-bytes',
      intruder.sid,
      intruder.csrfToken,
      { sessionId, byteLength: fileBytes.length },
    );
    assert.equal(releaseDenied.status, 403);

    const releaseOk = await postJson(
      baseUrl,
      '/uploads/vc-watch-together/release-bytes',
      host.sid,
      host.csrfToken,
      { sessionId, byteLength: fileBytes.length },
    );
    assert.equal(releaseOk.status, 204, releaseOk.text);

    console.log('vcWatchTogetherE2e.integration: ok');
  } finally {
    await close();
    await fs.rm(uploadRoot, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
