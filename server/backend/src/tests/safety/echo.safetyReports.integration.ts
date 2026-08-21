import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getEchoStore } from '../../domain/echoStore';
import { buildEchoTestApp } from '../helpers/echoTestApp';

async function registerUser(
  baseUrl: string,
  username: string,
): Promise<{ userId: string; csrfToken: string; sid: string }> {
  const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      email: `${username}@echo.test`,
      displayName: username,
    }),
  });
  const body = await reg.text();
  assert.equal(reg.status, 201, body);
  const json = JSON.parse(body) as {
    user: { id: string };
    csrfToken: string;
  };
  const sid =
    reg.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1] ?? '';
  assert.ok(sid);
  return { userId: json.user.id, csrfToken: json.csrfToken, sid };
}

async function run(): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) {
    console.log(
      'echo.safetyReports.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const tag = Date.now().toString(36);

  try {
    const t1 = await registerUser(baseUrl, `safety_r1_${tag}`);
    const t2 = await registerUser(baseUrl, `safety_r2_${tag}`);

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({ name: 'Safety Report Server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId, defaultChannelId } = JSON.parse(srvBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t2.csrfToken,
          cookie: `echo_sid=${t2.sid}`,
        },
      },
    );
    assert.equal(join.status, 200, await join.text());

    const msgId = randomUUID();
    const postMsg = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t2.csrfToken,
          cookie: `echo_sid=${t2.sid}`,
        },
        body: JSON.stringify({
          channelId: defaultChannelId,
          content: 'report me',
          id: msgId,
        }),
      },
    );
    const postMsgBody = await postMsg.text();
    assert.equal(postMsg.status, 201, postMsgBody);
    const created = JSON.parse(postMsgBody) as {
      message: { id: string };
    };
    const messageId = created.message.id;
    assert.ok(messageId);

    const reportUser = await fetch(`${baseUrl}/api/v1/echo/reports/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({
        targetUserId: t2.userId,
        reason: 'harassment in chat',
        category: 'harassment',
        messageId,
        channelId: defaultChannelId,
      }),
    });
    assert.equal(reportUser.status, 204, await reportUser.text());

    const reportUserDup = await fetch(`${baseUrl}/api/v1/echo/reports/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({
        targetUserId: t2.userId,
        reason: 'duplicate',
        category: 'spam',
      }),
    });
    assert.equal(reportUserDup.status, 204, await reportUserDup.text());

    const userCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM echo_user_reports WHERE reporter_id = $1 AND target_id = $2`,
      [t1.userId, t2.userId],
    );
    assert.equal(userCount.rows[0]?.n, 1);

    const reportMsg = await fetch(`${baseUrl}/api/v1/echo/reports/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({
        messageId,
        channelId: defaultChannelId,
        reason: 'offensive',
        category: 'hate',
      }),
    });
    assert.equal(reportMsg.status, 204, await reportMsg.text());

    const reportMsgDup = await fetch(`${baseUrl}/api/v1/echo/reports/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({
        messageId,
        channelId: defaultChannelId,
        reason: 'dup',
      }),
    });
    assert.equal(reportMsgDup.status, 204, await reportMsgDup.text());

    const msgCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM echo_message_reports WHERE reporter_id = $1 AND message_id = $2`,
      [t1.userId, messageId],
    );
    assert.equal(msgCount.rows[0]?.n, 1);

    const selfReport = await fetch(`${baseUrl}/api/v1/echo/reports/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t2.csrfToken,
        cookie: `echo_sid=${t2.sid}`,
      },
      body: JSON.stringify({
        messageId,
        channelId: defaultChannelId,
        reason: 'self',
      }),
    });
    assert.equal(selfReport.status, 400, await selfReport.text());

    const ghostChannel = `ghost_ch_${tag}`;
    const forbidden = await fetch(`${baseUrl}/api/v1/echo/reports/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1.sid}`,
      },
      body: JSON.stringify({
        messageId,
        channelId: ghostChannel,
        reason: 'nope',
      }),
    });
    assert.equal(forbidden.status, 403, await forbidden.text());

    console.log('echo.safetyReports.integration: ok');
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
