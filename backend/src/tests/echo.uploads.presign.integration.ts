/**
 * Presign authorization smoke tests (requires DATABASE_URL).
 * Run: npm run test:echo:uploads -w backend
 */
import assert from 'node:assert/strict';
import { getEchoStore } from '../domain/echoStore';
import { buildEchoTestApp } from './helpers/echoTestApp';

async function postPresign(
  baseUrl: string,
  sid: string | undefined,
  csrfToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/v1/echo/uploads/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: sid ? `echo_sid=${sid}` : '',
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
  return { status: res.status, json };
}

async function postDedupeRegister(
  baseUrl: string,
  sid: string | undefined,
  csrfToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/v1/echo/uploads/dedupe/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: sid ? `echo_sid=${sid}` : '',
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
  return { status: res.status, json };
}

async function run(): Promise<void> {
  let storeState: Awaited<ReturnType<typeof getEchoStore>>;
  try {
    storeState = await getEchoStore();
  } catch {
    console.log(
      'echo.uploads.presign.integration: skip (postgres unavailable)',
    );
    return;
  }
  const { enabled, pool } = storeState;
  if (!enabled || !pool) {
    console.log(
      'echo.uploads.presign.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const u1 = `up_u1_${Date.now().toString(36)}`;
  const u2 = `up_u2_${Date.now().toString(36)}`;

  try {
    const reg1 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u1,
        password: 'password123',
        email: `${u1}@echo.test`,
        displayName: 'Uploads 1',
      }),
    });
    const reg1Body = await reg1.text();
    assert.equal(reg1.status, 201, reg1Body);
    const t1 = JSON.parse(reg1Body) as {
      user: { id: string };
      csrfToken: string;
    };
    const t1Sid = reg1.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];

    const reg2 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u2,
        password: 'password123',
        email: `${u2}@echo.test`,
        displayName: 'Uploads 2',
      }),
    });
    const reg2Body = await reg2.text();
    assert.equal(reg2.status, 201, reg2Body);
    const t2 = JSON.parse(reg2Body) as {
      user: { id: string };
      csrfToken: string;
    };
    const t2Sid = reg2.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ name: 'Uploads Presign Server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId, defaultChannelId } = JSON.parse(srvBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const badCombo = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      channelId: defaultChannelId,
      purpose: 'user_avatar',
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(badCombo.status, 400, JSON.stringify(badCombo.json));

    const stranger = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      channelId: defaultChannelId,
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(stranger.status, 403, JSON.stringify(stranger.json));

    // Test data: URL rejection when S3 is enabled (simulated by non-configured check)
    const dataUrl = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      channelId: defaultChannelId,
      key: 'data:image/png;base64,abc',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      dataUrl.status === 400 || dataUrl.status === 503,
      `data: URL should be rejected (400) or S3 not configured (503), got ${dataUrl.status}`,
    );

    const member = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      channelId: defaultChannelId,
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      member.status === 503 || member.status === 200,
      `expected 503 (S3 off) or 200 (S3 on), got ${member.status} ${JSON.stringify(member.json)}`,
    );

    const avatar = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      purpose: 'user_avatar',
      key: 'p.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      avatar.status === 503 || avatar.status === 200,
      `user_avatar: expected 503 or 200, got ${avatar.status}`,
    );

    const serverIconStranger = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      serverId,
      purpose: 'server_icon',
      key: 'i.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      serverIconStranger.status,
      403,
      JSON.stringify(serverIconStranger.json),
    );

    const serverIconOwner = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      serverId,
      purpose: 'server_icon',
      key: 'i.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      serverIconOwner.status === 503 || serverIconOwner.status === 200,
      `server_icon owner: expected 503 or 200, got ${serverIconOwner.status}`,
    );
    if (
      serverIconOwner.status === 200 &&
      String(serverIconOwner.json.uploadMode ?? '') === 'local'
    ) {
      const uploadUrl = String(serverIconOwner.json.uploadUrl ?? '');
      const brandingKey = String(serverIconOwner.json.key ?? '');
      const headers =
        serverIconOwner.json.headers &&
        typeof serverIconOwner.json.headers === 'object' &&
        !Array.isArray(serverIconOwner.json.headers)
          ? (serverIconOwner.json.headers as Record<string, unknown>)
          : {};
      const auth = String(headers.Authorization ?? '');
      const blob = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const putRes = await fetch(`${baseUrl}${uploadUrl}`, {
        method: 'PUT',
        headers: {
          Authorization: auth,
          'Content-Type': 'image/png',
          cookie: `echo_sid=${t1Sid}`,
        },
        body: blob,
      });
      assert.equal(putRes.status, 204, await putRes.text());

      const encodedKey = encodeURIComponent(brandingKey).replace(/%2F/g, '/');
      const asStranger = await fetch(
        `${baseUrl}/api/v1/echo/uploads/files/${encodedKey}`,
        { headers: { cookie: `echo_sid=${t2Sid}` } },
      );
      assert.equal(asStranger.status, 200, await asStranger.text());

      const anonymous = await fetch(
        `${baseUrl}/api/v1/echo/uploads/files/${encodedKey}`,
      );
      assert.equal(
        anonymous.status,
        200,
        `${brandingKey}: ${await anonymous.text()}`,
      );
    }

    const eventCoverBadCombo = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      channelId: defaultChannelId,
      serverId,
      purpose: 'server_event_cover',
      key: 'c.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      eventCoverBadCombo.status,
      400,
      JSON.stringify(eventCoverBadCombo.json),
    );

    const eventCoverStranger = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      serverId,
      purpose: 'server_event_cover',
      key: 'c.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      eventCoverStranger.status,
      403,
      JSON.stringify(eventCoverStranger.json),
    );

    const eventCoverOwner = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      serverId,
      purpose: 'server_event_cover',
      key: 'c.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      eventCoverOwner.status === 503 || eventCoverOwner.status === 200,
      `server_event_cover owner: expected 503 or 200, got ${eventCoverOwner.status}`,
    );

    const minimalApplicationForm = {
      version: 1,
      questions: [
        {
          id: 'qwhy1234',
          type: 'short',
          label: 'Why join?',
          required: false,
          maxLength: 500,
        },
      ],
    };
    await pool.query(
      `UPDATE echo_servers SET applications_enabled = true, application_form = $2::jsonb WHERE id = $1`,
      [serverId, JSON.stringify(minimalApplicationForm)],
    );

    const appAttachBadCombo = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      channelId: defaultChannelId,
      serverId,
      purpose: 'server_application_attachment',
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      appAttachBadCombo.status,
      400,
      JSON.stringify(appAttachBadCombo.json),
    );

    const appAttachMember = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      serverId,
      purpose: 'server_application_attachment',
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      appAttachMember.status,
      403,
      JSON.stringify(appAttachMember.json),
    );

    const appAttachStranger = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      serverId,
      purpose: 'server_application_attachment',
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      appAttachStranger.status === 503 || appAttachStranger.status === 200,
      `server_application_attachment stranger: expected 503 or 200, got ${appAttachStranger.status}`,
    );

    await pool.query(
      `UPDATE echo_servers SET applications_enabled = false WHERE id = $1`,
      [serverId],
    );

    const appAttachDisabled = await postPresign(baseUrl, t2Sid, t2.csrfToken, {
      serverId,
      purpose: 'server_application_attachment',
      key: 'a.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.equal(
      appAttachDisabled.status,
      403,
      JSON.stringify(appAttachDisabled.json),
    );

    if (member.status === 200) {
      const uploadMode = String(member.json.uploadMode ?? '');
      if (uploadMode === 'local') {
        const uploadUrl = String(member.json.uploadUrl ?? '');
        const storageKey = String(member.json.key ?? '');
        const headers =
          member.json.headers &&
          typeof member.json.headers === 'object' &&
          !Array.isArray(member.json.headers)
            ? (member.json.headers as Record<string, unknown>)
            : {};
        const auth = String(headers.Authorization ?? '');
        const contentType = String(headers['Content-Type'] ?? 'image/png');
        // Must match presigned `contentLength` for local disk uploads (exact byte contract).
        const blob = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const putRes = await fetch(`${baseUrl}${uploadUrl}`, {
          method: 'PUT',
          headers: {
            Authorization: auth,
            'Content-Type': contentType,
            // requireAuth uses echo_sid unless AUTH_LEGACY_BEARER (CI default: off).
            cookie: `echo_sid=${t1Sid}`,
          },
          body: blob,
        });
        const putText = await putRes.text();
        assert.equal(putRes.status, 204, putText);

        const asOwner = await fetch(
          `${baseUrl}/api/v1/echo/uploads/files/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`,
          {
            headers: { cookie: `echo_sid=${t1Sid}` },
          },
        );
        assert.equal(asOwner.status, 200, await asOwner.text());

        const asStranger = await fetch(
          `${baseUrl}/api/v1/echo/uploads/files/${encodeURIComponent(storageKey).replace(/%2F/g, '/')}`,
          {
            headers: { cookie: `echo_sid=${t2Sid}` },
          },
        );
        assert.equal(asStranger.status, 403, await asStranger.text());

        const badRegister = await postDedupeRegister(
          baseUrl,
          t1Sid,
          t1.csrfToken,
          {
            channelId: defaultChannelId,
            objectKey: 'a.png',
            storageKey,
            kind: 'image',
            contentType: 'image/png',
            byteLength: 9999,
            sha256Hex:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            phashHex: 'aaaaaaaaaaaaaaaa',
          },
        );
        assert.equal(badRegister.status, 400, JSON.stringify(badRegister.json));
      }
    }

    const paperCh = await fetch(
      `${baseUrl}/api/v1/echo/servers/${serverId}/channels`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ name: 'Paper uploads', type: 'paper' }),
      },
    );
    const paperChBody = await paperCh.text();
    assert.equal(paperCh.status, 201, paperChBody);
    const { channelId: paperChannelId } = JSON.parse(paperChBody) as {
      channelId: string;
    };

    const paperUpload = await postPresign(baseUrl, t1Sid, t1.csrfToken, {
      channelId: paperChannelId,
      key: 'paper.png',
      contentType: 'image/png',
      contentLength: 10,
    });
    assert.ok(
      paperUpload.status === 503 || paperUpload.status === 200,
      `paper channel upload: expected 503 or 200, got ${paperUpload.status} ${JSON.stringify(paperUpload.json)}`,
    );
    assert.notEqual(
      paperUpload.status,
      403,
      'paper authors must not be denied presign (was blocked by canUserPostMessage)',
    );

    console.log('echo.uploads.presign.integration: ok');
  } finally {
    await close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
