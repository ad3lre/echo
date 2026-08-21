/**
 * Pipeline tests: HTTP + Socket.IO + Postgres (requires DATABASE_URL).
 * Run: ECHO_GUEST_ACCOUNTS_ENABLED=1 npm run test:echo:pipeline -w backend
 *
 * Guest carve-out tests need guests enabled before Node loads `config` (imports are hoisted).
 */
process.env.ECHO_GUEST_ACCOUNTS_ENABLED =
  process.env.ECHO_GUEST_ACCOUNTS_ENABLED ?? '1';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import { getEchoStore } from '../../domain/echoStore';
import { resetOfficialEchoServerIdCacheForTests } from '../../domain/echoStore/servers/officialServerOnboarding';
import { buildEchoTestApp } from '../helpers/echoTestApp';

async function pollChannelMessage(
  baseUrl: string,
  channelId: string,
  messageId: string,
  sid: string,
  opts?: { expectedContent?: string; timeoutMs?: number },
): Promise<{ content: string }> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    const res = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      { headers: { cookie: `echo_sid=${sid}` } },
    );
    lastStatus = res.status;
    lastBody = await res.text();
    if (res.status === 200) {
      const json = JSON.parse(lastBody) as {
        message?: { content?: string; searchIndexText?: string };
      };
      const content =
        json.message?.content ?? json.message?.searchIndexText ?? '';
      if (!opts?.expectedContent || content === opts.expectedContent) {
        return { content };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `pollChannelMessage timeout (last ${lastStatus}): ${lastBody.slice(0, 240)}`,
  );
}

async function pollMutualFriendsVisible(
  baseUrl: string,
  peerId: string,
  sid: string,
  timeoutMs = 10_000,
): Promise<{ status: number; body: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  let lastBody = '';
  while (Date.now() < deadline) {
    const res = await fetch(
      `${baseUrl}/api/v1/echo/friends/mutual?peerId=${encodeURIComponent(peerId)}`,
      { headers: { cookie: `echo_sid=${sid}` } },
    );
    lastStatus = res.status;
    lastBody = await res.text();
    if (res.status === 200) return { status: res.status, body: lastBody };
    if (res.status !== 403) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return { status: lastStatus, body: lastBody };
}

async function run(): Promise<void> {
  let enabled = false;
  let pool: Awaited<ReturnType<typeof getEchoStore>>['pool'] = null;
  try {
    const s = await getEchoStore();
    enabled = s.enabled;
    pool = s.pool;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /Postgres is unavailable|pool is unavailable|Check DATABASE_URL/i.test(
        msg,
      )
    ) {
      console.log(
        'echo.pipeline.integration: skip (Echo store unavailable)',
        msg,
      );
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log(
      'echo.pipeline.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const u1 = `pipe_u1_${Date.now().toString(36)}`;
  const u2 = `pipe_u2_${Date.now().toString(36)}`;

  try {
    const reg1 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u1,
        password: 'password123',
        email: `${u1}@echo.test`,
        displayName: 'P1',
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
        displayName: 'P2',
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
    const t2UserId = t2.user.id;
    const t1UserId = t1.user.id;

    const frSelf = await fetch(`${baseUrl}/api/v1/echo/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerId: t1UserId }),
    });
    assert.equal(frSelf.status, 400, await frSelf.text());

    const presenceOverLimit = await fetch(
      `${baseUrl}/api/v1/echo/presence?ids=${Array.from({ length: 201 }, (_, i) => `p${i}`).join(',')}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    assert.equal(presenceOverLimit.status, 400, await presenceOverLimit.text());

    const presenceOk = await fetch(
      `${baseUrl}/api/v1/echo/presence?ids=${encodeURIComponent(t1UserId)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    assert.equal(presenceOk.status, 200, await presenceOk.text());

    const prPaddedIdle = await fetch(`${baseUrl}/api/v1/echo/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ status: '  idle  ' }),
    });
    assert.equal(prPaddedIdle.status, 204, await prPaddedIdle.text());

    const prEmptyMeansOnline = await fetch(`${baseUrl}/api/v1/echo/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ status: '' }),
    });
    assert.equal(
      prEmptyMeansOnline.status,
      204,
      await prEmptyMeansOnline.text(),
    );

    // --- Sockets: Delete Legacy Ephemeral Reality ---
    const sLegacy: IoClientSocket = ioClient(baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    const legacyFail = await new Promise<{ code?: string }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timeout legacy_ephem')),
          8000,
        );
        sLegacy.once('message_failed', (p: any) => {
          clearTimeout(timer);
          resolve(p);
        });
        sLegacy.emit('joinChannel', 'legacy_ephem_channel');
        sLegacy.emit('message', {
          channelId: 'legacy_ephem_channel',
          content: 'should fail',
        });
      },
    );
    assert.equal(legacyFail.code, 'UNKNOWN_CHANNEL');
    sLegacy.disconnect();

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ name: 'Pipeline Server' }),
    });
    const srvBody = await srv.text();
    assert.equal(srv.status, 201, srvBody);
    const { serverId, defaultChannelId } = JSON.parse(srvBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const delist = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ listedInDirectory: false }),
      },
    );
    const delistBody = await delist.text();
    assert.equal(delist.status, 204, delistBody);
    const workspaceAfterDelist = await fetch(
      `${baseUrl}/api/v1/echo/workspace`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    const workspaceAfterDelistBody = await workspaceAfterDelist.text();
    assert.equal(workspaceAfterDelist.status, 200, workspaceAfterDelistBody);
    const workspaceAfterDelistJson = JSON.parse(workspaceAfterDelistBody) as {
      servers?: Array<{ id: string; listedInDirectory?: boolean }>;
    };
    const delistedServer = (workspaceAfterDelistJson.servers ?? []).find(
      (s) => s.id === serverId,
    );
    assert.equal(
      delistedServer?.listedInDirectory,
      false,
      'workspace snapshot should preserve listedInDirectory=false',
    );

    const chListRes = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    const chListBody = await chListRes.text();
    assert.equal(chListRes.status, 200, chListBody);
    const defCatId = (
      JSON.parse(chListBody) as { channels: { categoryId: string }[] }
    ).channels[0]!.categoryId;

    const patchDefCat = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(defCatId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ position: 10 }),
      },
    );
    assert.equal(patchDefCat.status, 204, await patchDefCat.text());

    const postZ = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/categories`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ name: 'Zebra', position: 0 }),
      },
    );
    const postZBody = await postZ.text();
    assert.equal(postZ.status, 201, postZBody);
    const zebraId = (JSON.parse(postZBody) as { categoryId: string })
      .categoryId;

    const postA = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/categories`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ name: 'AAA', position: 1 }),
      },
    );
    const postABody = await postA.text();
    assert.equal(postA.status, 201, postABody);
    const aaaId = (JSON.parse(postABody) as { categoryId: string }).categoryId;

    for (const [nm, cid] of [
      ['z-ch', zebraId],
      ['a-ch', aaaId],
    ] as const) {
      const cr = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': t1.csrfToken,
            cookie: `echo_sid=${t1Sid}`,
          },
          body: JSON.stringify({ name: nm, type: 'text', categoryId: cid }),
        },
      );
      const crBody = await cr.text();
      assert.equal(cr.status, 201, crBody);
    }

    const orderRes = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/channels`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    const orderBody = await orderRes.text();
    assert.equal(orderRes.status, 200, orderBody);
    const orderedCh = (
      JSON.parse(orderBody) as {
        channels: { categoryId: string; categoryName: string }[];
      }
    ).channels;
    const categoryOrder: string[] = [];
    const seenCat = new Set<string>();
    for (const row of orderedCh) {
      if (seenCat.has(row.categoryId)) continue;
      seenCat.add(row.categoryId);
      categoryOrder.push(row.categoryName);
    }
    // New servers seed Text + Voice default categories (see createEchoServer); list order follows channel walk.
    assert.deepEqual(categoryOrder, [
      'Zebra',
      'AAA',
      'Voice Channels',
      'Text Channels',
    ]);

    const rename = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({
          name: 'Pipeline Server Renamed',
          vanityCode: 'echo',
          description: 'Integration test blurb.',
        }),
      },
    );
    const renameBody = await rename.text();
    assert.equal(rename.status, 204, renameBody);
    resetOfficialEchoServerIdCacheForTests();

    const listAfter = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      headers: { cookie: `echo_sid=${t1Sid}` },
    });
    const listBody = await listAfter.text();
    assert.equal(listAfter.status, 200, listBody);
    const listed = JSON.parse(listBody) as {
      servers: { id: string; name: string; description?: string }[];
    };
    const row = listed.servers.find((x) => x.id === serverId);
    assert.ok(row);
    assert.equal(row!.name, 'Pipeline Server Renamed');
    assert.equal(row!.description, 'Integration test blurb.');

    const roleUi = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/role-ui-bootstrap`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const roleUiBody = await roleUi.text();
    assert.equal(roleUi.status, 200, roleUiBody);
    const roleUiJson = JSON.parse(roleUiBody) as {
      capabilities: { canManageRoles: boolean };
      roles: unknown[];
      assignments: Record<string, unknown>;
    };
    assert.equal(typeof roleUiJson.capabilities.canManageRoles, 'boolean');
    assert.ok(Array.isArray(roleUiJson.roles));
    assert.equal(typeof roleUiJson.assignments, 'object');

    const s1: IoClientSocket = ioClient(baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('socket connect timeout (s1)')),
        15000,
      );
      s1.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      s1.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    s1.emit('joinChannel', defaultChannelId);
    // Server applies join asynchronously (Echo permission checks).
    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    // `before=` pagination filters with the same id ordering as Postgres uses for
    // message ids (lex for UUIDs, numeric for snowflakes). Choose client ids so the
    // later REST message sorts strictly after the socket message; otherwise the
    // padded `before=` regression can flake when UUID lex order disagrees with time.
    let msgId: string;
    let restPostId: string;
    for (let attempt = 0; ; attempt++) {
      assert.ok(
        attempt < 48,
        'could not pick message ids so REST id sorts after socket id for before= paging',
      );
      msgId = randomUUID();
      restPostId = randomUUID();
      if (restPostId > msgId) break;
    }

    const received = await new Promise<unknown>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('timeout waiting for message')),
        8000,
      );
      s1.once('message', (m) => {
        clearTimeout(t);
        resolve(m);
      });
      s1.emit('message', {
        channelId: defaultChannelId,
        content: 'pipeline hello',
        id: msgId,
      });
    });
    assert.equal(typeof received, 'object');
    assert.equal((received as { content?: string }).content, 'pipeline hello');
    const savedMsgId = (received as { id?: string }).id;
    assert.ok(savedMsgId);

    const getMsg = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages/${encodeURIComponent(savedMsgId!)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const getMsgBody = await getMsg.text();
    assert.equal(getMsg.status, 200, getMsgBody);
    const getMsgJson = JSON.parse(getMsgBody) as { message: { id: string } };
    assert.equal(getMsgJson.message.id, savedMsgId);

    // REST must land in a later timeline second than the socket message so
    // created_at DESC (then id DESC) lists the REST row before the socket row.
    await new Promise<void>((resolve) => setTimeout(resolve, 1100));

    const postRest = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({
          channelId: defaultChannelId,
          content: 'rest create',
          id: restPostId,
        }),
      },
    );
    const postRestBody = await postRest.text();
    assert.equal(postRest.status, 201, postRestBody);
    const restCreated = JSON.parse(postRestBody) as { message: { id: string } };

    const postDup = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({
          channelId: defaultChannelId,
          content: 'dup body ignored for idempotent replay',
          id: restCreated.message.id,
        }),
      },
    );
    assert.equal(postDup.status, 200, await postDup.text());

    const listLatest = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages?limit=50`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const listLatestBody = await listLatest.text();
    assert.equal(listLatest.status, 200, listLatestBody);
    const listLatestJson = JSON.parse(listLatestBody) as {
      messages: { id: string }[];
    };
    const latestIds = listLatestJson.messages.map((m) => m.id);
    assert.ok(
      latestIds.includes(savedMsgId!),
      'latest page must include client UUID id (not only id DESC snowflakes)',
    );
    assert.ok(latestIds.includes(restCreated.message.id));
    const restIdx = latestIds.indexOf(restCreated.message.id);
    const savedIdx = latestIds.indexOf(savedMsgId!);
    assert.ok(
      restIdx >= 0 && savedIdx >= 0 && restIdx > savedIdx,
      'latest page is chronological ASC: newer REST row after older socket row',
    );

    const listPaddedBefore = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages?before=${encodeURIComponent(` ${restCreated.message.id} `)}&limit=50`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const listPaddedBody = await listPaddedBefore.text();
    assert.equal(listPaddedBefore.status, 200, listPaddedBody);
    const listPaddedJson = JSON.parse(listPaddedBody) as {
      messages: { id: string }[];
    };
    assert.ok(
      listPaddedJson.messages.some((m) => m.id === savedMsgId),
      'padded before= cursor should still page older messages',
    );

    const rxPut = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages/${encodeURIComponent(savedMsgId!)}/reactions`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ emoji: '👍' }),
      },
    );
    assert.equal(rxPut.status, 200, await rxPut.text());

    const rxPutPaddedEmoji = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages/${encodeURIComponent(savedMsgId!)}/reactions`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ emoji: '  👍  ' }),
      },
    );
    const rxPadBody = await rxPutPaddedEmoji.text();
    assert.equal(rxPutPaddedEmoji.status, 200, rxPadBody);
    const rxPadJson = JSON.parse(rxPadBody) as {
      reactions: { emoji: string; userIds: string[] }[];
    };
    const thumbRx = rxPadJson.reactions.find((r) => r.emoji === '👍');
    assert.ok(
      thumbRx?.userIds.includes(t1UserId),
      'padded emoji body should normalize to same reaction key',
    );

    const msgGetPaddedPath = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(` ${defaultChannelId} `)}/messages/${encodeURIComponent(savedMsgId!)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    assert.equal(msgGetPaddedPath.status, 200, await msgGetPaddedPath.text());

    const pinPost = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/pins`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ messageId: savedMsgId }),
      },
    );
    assert.equal(pinPost.status, 403, await pinPost.text());

    const pinsGet = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/pins`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    const pinsBody = await pinsGet.text();
    assert.equal(pinsGet.status, 200, pinsBody);
    const pinsJson = JSON.parse(pinsBody) as { messageIds: string[] };
    assert.equal(pinsJson.messageIds.length, 0);

    const rsPut = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/read-state`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ lastReadMessageId: savedMsgId }),
      },
    );
    const rsPutBody = await rsPut.text();
    assert.equal(rsPut.status, 200, rsPutBody);
    const rsPutJson = JSON.parse(rsPutBody) as {
      channelAttentionByChannelId?: Record<
        string,
        { lastReadMessageId?: string | null }
      >;
    };
    assert.equal(
      rsPutJson.channelAttentionByChannelId?.[defaultChannelId]
        ?.lastReadMessageId,
      savedMsgId,
    );

    const rsGet = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/read-state`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    const rsGetBody = await rsGet.text();
    assert.equal(rsGet.status, 200, rsGetBody);
    const rsJson = JSON.parse(rsGetBody) as {
      lastReadMessageId: string | null;
    };
    assert.equal(rsJson.lastReadMessageId, savedMsgId);

    const searchAttach = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/messages/search?hasAttachment=1&limit=5`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    assert.equal(searchAttach.status, 200, await searchAttach.text());

    const reqOut = await fetch(`${baseUrl}/api/v1/echo/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerId: `  ${t2UserId}  ` }),
    });
    assert.equal(reqOut.status, 204, await reqOut.text());
    const reqDup = await fetch(`${baseUrl}/api/v1/echo/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerId: `\t${t2UserId}\n` }),
    });
    assert.equal(reqDup.status, 409, await reqDup.text());
    const acceptFr = await fetch(`${baseUrl}/api/v1/echo/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t2.csrfToken,
        cookie: `echo_sid=${t2Sid}`,
      },
      body: JSON.stringify({ peerId: ` ${t1UserId} ` }),
    });
    assert.equal(acceptFr.status, 204, await acceptFr.text());
    const acceptFrDup = await fetch(`${baseUrl}/api/v1/echo/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t2.csrfToken,
        cookie: `echo_sid=${t2Sid}`,
      },
      body: JSON.stringify({ peerId: t1UserId }),
    });
    assert.equal(acceptFrDup.status, 404, await acceptFrDup.text());

    const dmOpen1 = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerUserId: t2UserId }),
    });
    const dmOpen1Body = await dmOpen1.text();
    assert.equal(dmOpen1.status, 200, dmOpen1Body);
    const dmOpen1Json = JSON.parse(dmOpen1Body) as {
      channelId: string;
      peerUserId: string;
    };
    assert.equal(dmOpen1Json.peerUserId, t2UserId);

    const dmOpen2 = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerUserId: t2UserId }),
    });
    const dmOpen2Body = await dmOpen2.text();
    assert.equal(dmOpen2.status, 200, dmOpen2Body);
    const dmOpen2Json = JSON.parse(dmOpen2Body) as { channelId: string };
    assert.equal(dmOpen2Json.channelId, dmOpen1Json.channelId);

    const enableDmE2ee = await fetch(
      `${baseUrl}/api/v1/echo/dm/${encodeURIComponent(dmOpen1Json.channelId)}/e2ee/enable`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
      },
    );
    const enableDmE2eeBody = await enableDmE2ee.text();
    assert.equal(enableDmE2ee.status, 410, enableDmE2eeBody);
    assert.match(enableDmE2eeBody, /E2EE_CHAT_REMOVED/);

    const e2eeStateOwner = await fetch(
      `${baseUrl}/api/v1/echo/e2ee/thread/${encodeURIComponent(dmOpen1Json.channelId)}/state`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const e2eeStateOwnerBody = await e2eeStateOwner.text();
    assert.equal(e2eeStateOwner.status, 200, e2eeStateOwnerBody);
    assert.equal(
      (JSON.parse(e2eeStateOwnerBody) as { enabled?: boolean }).enabled,
      false,
    );

    const dmThreads = await fetch(`${baseUrl}/api/v1/echo/dm/threads`, {
      headers: { cookie: `echo_sid=${t1Sid}` },
    });
    const dmThreadsBody = await dmThreads.text();
    assert.equal(dmThreads.status, 200, dmThreadsBody);
    const dmThreadsJson = JSON.parse(dmThreadsBody) as {
      threads: { channelId: string; kind?: string; peerUserId?: string }[];
    };
    assert.ok(
      dmThreadsJson.threads.some((x) => x.channelId === dmOpen1Json.channelId),
    );

    const u3 = `pipe_u3_${Date.now().toString(36)}`;
    const reg3 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u3,
        password: 'password123',
        email: `${u3}@echo.test`,
        displayName: 'P3',
      }),
    });
    const reg3Body = await reg3.text();
    assert.equal(reg3.status, 201, reg3Body);
    const t3 = JSON.parse(reg3Body) as {
      user: { id: string };
      csrfToken: string;
    };
    const t3Sid = reg3.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];

    const hiddenStrangerPresence = await fetch(
      `${baseUrl}/api/v1/echo/presence?ids=${encodeURIComponent(t3.user.id)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const hiddenStrangerPresenceBody = await hiddenStrangerPresence.text();
    assert.equal(
      hiddenStrangerPresence.status,
      200,
      hiddenStrangerPresenceBody,
    );
    const hiddenStrangerPresenceJson = JSON.parse(
      hiddenStrangerPresenceBody,
    ) as {
      presence: Record<string, string>;
    };
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        hiddenStrangerPresenceJson.presence,
        t3.user.id,
      ),
      false,
    );

    const mutualFriendsStranger = await pollMutualFriendsVisible(
      baseUrl,
      t3.user.id,
      t1Sid!,
    );
    // Signup auto-join is best-effort and asynchronous. Once both users have
    // joined Echo home, mutual lookup is allowed but returns none.
    assert.equal(mutualFriendsStranger.status, 200, mutualFriendsStranger.body);
    assert.deepEqual(
      (JSON.parse(mutualFriendsStranger.body) as { userIds: string[] }).userIds,
      [],
    );

    const e2eeStateStranger = await fetch(
      `${baseUrl}/api/v1/echo/e2ee/thread/${encodeURIComponent(dmOpen1Json.channelId)}/state`,
      { headers: { cookie: `echo_sid=${t3Sid}` } },
    );
    assert.equal(e2eeStateStranger.status, 403, await e2eeStateStranger.text());

    const dmStranger = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerUserId: t3.user.id }),
    });
    const dmStrangerBody = await dmStranger.text();
    // Echo home membership counts as a shared server for DM open.
    assert.equal(dmStranger.status, 200, dmStrangerBody);
    const dmStrangerJson = JSON.parse(dmStrangerBody) as {
      channelId: string;
      peerUserId: string;
    };
    assert.equal(dmStrangerJson.peerUserId, t3.user.id);
    assert.ok(dmStrangerJson.channelId.length > 0);

    const blockRes = await fetch(`${baseUrl}/api/v1/echo/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ targetUserId: t2UserId }),
    });
    assert.equal(blockRes.status, 204, await blockRes.text());

    const blockAgain = await fetch(`${baseUrl}/api/v1/echo/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ targetUserId: t2UserId }),
    });
    const blockAgainBody = await blockAgain.text();
    assert.equal(blockAgain.status, 200, blockAgainBody);
    assert.equal(
      (JSON.parse(blockAgainBody) as { alreadyBlocked?: boolean })
        .alreadyBlocked,
      true,
    );

    const blockGhost = await fetch(`${baseUrl}/api/v1/echo/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({
        targetUserId: `pipe_block_ghost_${Date.now().toString(36)}`,
      }),
    });
    assert.equal(blockGhost.status, 404, await blockGhost.text());

    const dmAfterBlock = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerUserId: t2UserId }),
    });
    assert.equal(dmAfterBlock.status, 403, await dmAfterBlock.text());

    const mrRes = await fetch(`${baseUrl}/api/v1/echo/dm/message-requests`, {
      headers: { cookie: `echo_sid=${t2Sid}` },
    });
    assert.equal(mrRes.status, 200, await mrRes.text());

    const unblockT2 = await fetch(
      `${baseUrl}/api/v1/echo/blocks/${encodeURIComponent(t2UserId)}`,
      {
        method: 'DELETE',
        headers: {
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
      },
    );
    assert.equal(unblockT2.status, 204, await unblockT2.text());
    const unblockT2Dup = await fetch(
      `${baseUrl}/api/v1/echo/blocks/${encodeURIComponent(t2UserId)}`,
      {
        method: 'DELETE',
        headers: {
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
      },
    );
    const unblockT2DupBody = await unblockT2Dup.text();
    assert.equal(unblockT2Dup.status, 404, unblockT2DupBody);
    assert.equal(
      (JSON.parse(unblockT2DupBody) as { code?: string }).code,
      'NOT_BLOCKED',
    );
    const unblockGhost = await fetch(
      `${baseUrl}/api/v1/echo/blocks/${encodeURIComponent(`pipe_unblock_ghost_${Date.now().toString(36)}`)}`,
      {
        method: 'DELETE',
        headers: {
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
      },
    );
    assert.equal(unblockGhost.status, 404, await unblockGhost.text());

    const gTag = Date.now().toString(36);
    async function regPipeUser(suffix: string) {
      const un = `pipe_g${suffix}_${gTag}`;
      const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: un,
          password: 'password123',
          email: `${un}@echo.test`,
          displayName: suffix,
        }),
      });
      const body = await reg.text();
      assert.equal(reg.status, 201, body);
      const json = JSON.parse(body) as {
        user: { id: string };
        csrfToken: string;
      };
      const sid = reg.headers
        .get('set-cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('echo_sid='))
        ?.split('=')[1];
      return { ...json, sid };
    }
    const g4 = await regPipeUser('4');
    const g5 = await regPipeUser('5');
    const g6 = await regPipeUser('6');
    const id4 = g4.user.id;
    const id5 = g5.user.id;
    const id6 = g6.user.id;

    const blockG5 = await fetch(`${baseUrl}/api/v1/echo/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': g4.csrfToken,
        cookie: `echo_sid=${g4.sid}`,
      },
      body: JSON.stringify({ targetUserId: id5 }),
    });
    assert.equal(blockG5.status, 204, await blockG5.text());

    const grpOpenStrangers = await fetch(
      `${baseUrl}/api/v1/echo/dm/group/open`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': g4.csrfToken,
          cookie: `echo_sid=${g4.sid}`,
        },
        body: JSON.stringify({
          memberUserIds: [id4, id5, id6],
          name: 'Stranger Group',
        }),
      },
    );
    assert.equal(grpOpenStrangers.status, 403, await grpOpenStrangers.text());

    const unblockG5 = await fetch(
      `${baseUrl}/api/v1/echo/blocks/${encodeURIComponent(id5)}`,
      {
        method: 'DELETE',
        headers: {
          'x-csrf-token': g4.csrfToken,
          cookie: `echo_sid=${g4.sid}`,
        },
      },
    );
    assert.equal(unblockG5.status, 204, await unblockG5.text());

    async function makeFriends(a: any, b: any) {
      const r1 = await fetch(`${baseUrl}/api/v1/echo/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': a.csrfToken,
          cookie: `echo_sid=${a.sid}`,
        },
        body: JSON.stringify({ peerId: b.user.id }),
      });
      assert.equal(r1.status, 204, await r1.text());
      const r2 = await fetch(`${baseUrl}/api/v1/echo/friends/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': b.csrfToken,
          cookie: `echo_sid=${b.sid}`,
        },
        body: JSON.stringify({ peerId: a.user.id }),
      });
      assert.equal(r2.status, 204, await r2.text());
    }

    await makeFriends(g4, g5);
    await makeFriends(g4, g6);
    await makeFriends(g5, g6);

    const grpOpen = await fetch(`${baseUrl}/api/v1/echo/dm/group/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': g4.csrfToken,
        cookie: `echo_sid=${g4.sid}`,
      },
      body: JSON.stringify({
        memberUserIds: [id4, id5, id6],
        name: 'Pipeline Group',
      }),
    });
    const grpOpenBody = await grpOpen.text();
    assert.equal(grpOpen.status, 200, grpOpenBody);
    const grpJson = JSON.parse(grpOpenBody) as { channelId: string };
    assert.ok(grpJson.channelId);

    const grpThreads = await fetch(`${baseUrl}/api/v1/echo/dm/threads`, {
      headers: { cookie: `echo_sid=${g5.sid}` },
    });
    const grpThreadsBody = await grpThreads.text();
    assert.equal(grpThreads.status, 200, grpThreadsBody);
    const grpThreadsJson = JSON.parse(grpThreadsBody) as {
      threads: { channelId: string; kind?: string; memberUserIds?: string[] }[];
    };
    const gRow = grpThreadsJson.threads.find(
      (x) => x.channelId === grpJson.channelId,
    );
    assert.ok(gRow);
    assert.equal(gRow!.kind, 'group');
    assert.ok(Array.isArray(gRow!.memberUserIds));
    assert.ok(gRow!.memberUserIds!.includes(id5));

    const g7 = await regPipeUser('7');
    const blockG7 = await fetch(`${baseUrl}/api/v1/echo/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': g4.csrfToken,
        cookie: `echo_sid=${g4.sid}`,
      },
      body: JSON.stringify({ targetUserId: g7.user.id }),
    });
    assert.equal(blockG7.status, 204, await blockG7.text());

    const addStrangerToGroup = await fetch(
      `${baseUrl}/api/v1/echo/dm/group/${encodeURIComponent(grpJson.channelId)}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': g4.csrfToken,
          cookie: `echo_sid=${g4.sid}`,
        },
        body: JSON.stringify({ memberUserIds: [g7.user.id] }),
      },
    );
    assert.equal(
      addStrangerToGroup.status,
      403,
      await addStrangerToGroup.text(),
    );

    const kickMember = await fetch(
      `${baseUrl}/api/v1/echo/dm/group/${encodeURIComponent(grpJson.channelId)}/members/${encodeURIComponent(id6)}`,
      {
        method: 'DELETE',
        headers: {
          'x-csrf-token': g4.csrfToken,
          cookie: `echo_sid=${g4.sid}`,
        },
      },
    );
    assert.equal(kickMember.status, 204, await kickMember.text());

    const grpThreadsAfterKick = await fetch(
      `${baseUrl}/api/v1/echo/dm/threads`,
      { headers: { cookie: `echo_sid=${g4.sid}` } },
    );
    const grpThreadsAfterBody = await grpThreadsAfterKick.text();
    assert.equal(grpThreadsAfterKick.status, 200, grpThreadsAfterBody);
    const grpThreadsAfterJson = JSON.parse(grpThreadsAfterBody) as {
      threads: { channelId: string; memberUserIds?: string[] }[];
    };
    const gRowAfter = grpThreadsAfterJson.threads.find(
      (x) => x.channelId === grpJson.channelId,
    );
    assert.ok(gRowAfter);
    assert.ok(!gRowAfter!.memberUserIds?.includes(id6));
    assert.ok(gRowAfter!.memberUserIds?.includes(id5));

    const leaveGroup = await fetch(
      `${baseUrl}/api/v1/echo/dm/group/${encodeURIComponent(grpJson.channelId)}/leave`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': g5.csrfToken,
          cookie: `echo_sid=${g5.sid}`,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(leaveGroup.status, 204, await leaveGroup.text());

    const grpThreadsAfterLeave = await fetch(
      `${baseUrl}/api/v1/echo/dm/threads`,
      { headers: { cookie: `echo_sid=${g5.sid}` } },
    );
    const grpThreadsAfterLeaveBody = await grpThreadsAfterLeave.text();
    assert.equal(grpThreadsAfterLeave.status, 200, grpThreadsAfterLeaveBody);
    const grpThreadsAfterLeaveJson = JSON.parse(grpThreadsAfterLeaveBody) as {
      threads: { channelId: string }[];
    };
    assert.ok(
      !grpThreadsAfterLeaveJson.threads.some(
        (x) => x.channelId === grpJson.channelId,
      ),
    );

    const grpThreadsG4Still = await fetch(`${baseUrl}/api/v1/echo/dm/threads`, {
      headers: { cookie: `echo_sid=${g4.sid}` },
    });
    const grpThreadsG4Body = await grpThreadsG4Still.text();
    assert.equal(grpThreadsG4Still.status, 200, grpThreadsG4Body);
    const grpThreadsG4Json = JSON.parse(grpThreadsG4Body) as {
      threads: { channelId: string; memberUserIds?: string[] }[];
    };
    const gRowG4 = grpThreadsG4Json.threads.find(
      (x) => x.channelId === grpJson.channelId,
    );
    assert.ok(gRowG4);
    assert.ok(!gRowG4!.memberUserIds?.includes(id5));
    assert.ok(gRowG4!.memberUserIds?.includes(id4));

    const roleUiForbidden = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/role-ui-bootstrap`,
      { headers: { cookie: `echo_sid=${t2Sid}` } },
    );
    assert.equal(roleUiForbidden.status, 403, await roleUiForbidden.text());

    const s2: IoClientSocket = ioClient(baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t2Sid}` },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('socket connect timeout (s2)')),
        15000,
      );
      s2.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      s2.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const forbidden = await new Promise<{ code?: string }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timeout message_failed')),
          8000,
        );
        s2.once('message_failed', (p: any) => {
          clearTimeout(timer);
          resolve(p);
        });
        s2.emit('message', {
          channelId: defaultChannelId,
          content: 'should fail',
          id: randomUUID(),
        });
      },
    );
    assert.equal(forbidden.code, 'FORBIDDEN');

    const searchOk = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/messages/search?q=pipeline`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const searchOkBody = await searchOk.text();
    assert.equal(searchOk.status, 200, searchOkBody);
    const searchJson = JSON.parse(searchOkBody) as {
      messages: { content: string }[];
    };
    assert.ok(Array.isArray(searchJson.messages));
    assert.ok(
      searchJson.messages.some((m) => (m.content ?? '').includes('pipeline')),
    );

    const searchForbidden = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/messages/search?q=pipeline`,
      { headers: { cookie: `echo_sid=${t2Sid}` } },
    );
    assert.equal(searchForbidden.status, 403, await searchForbidden.text());

    // --- Socket message:edit forbidden (wrong author) + correlationId echo ---
    const reListForT2Join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ listedInDirectory: true }),
      },
    );
    assert.equal(reListForT2Join.status, 204, await reListForT2Join.text());

    const t2JoinMember = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t2.csrfToken,
          cookie: `echo_sid=${t2Sid}`,
        },
      },
    );
    assert.equal(t2JoinMember.status, 200, await t2JoinMember.text());

    // Mutual server (no friendship): registered users may open a persisted DM thread.
    const u4 = `pipe_u4_${Date.now().toString(36)}`;
    const reg4 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u4,
        password: 'password123',
        email: `${u4}@echo.test`,
        displayName: 'P4',
      }),
    });
    const reg4Body = await reg4.text();
    assert.equal(reg4.status, 201, reg4Body);
    const t4 = JSON.parse(reg4Body) as {
      user: { id: string };
      csrfToken: string;
    };
    const t4Sid = reg4.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    const t4Join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t4.csrfToken,
          cookie: `echo_sid=${t4Sid}`,
        },
      },
    );
    assert.equal(t4Join.status, 200, await t4Join.text());

    const t4SetPresence = await fetch(`${baseUrl}/api/v1/echo/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t4.csrfToken,
        cookie: `echo_sid=${t4Sid}`,
      },
      body: JSON.stringify({ status: 'idle' }),
    });
    assert.equal(t4SetPresence.status, 204, await t4SetPresence.text());

    const sharedServerPresence = await fetch(
      `${baseUrl}/api/v1/echo/presence?ids=${encodeURIComponent(t4.user.id)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    const sharedServerPresenceBody = await sharedServerPresence.text();
    assert.equal(sharedServerPresence.status, 200, sharedServerPresenceBody);
    const sharedServerPresenceJson = JSON.parse(sharedServerPresenceBody) as {
      presence: Record<string, string>;
    };
    assert.equal(sharedServerPresenceJson.presence[t4.user.id], 'idle');

    const mutualFriendsSharedServer = await fetch(
      `${baseUrl}/api/v1/echo/friends/mutual?peerId=${encodeURIComponent(t4.user.id)}`,
      { headers: { cookie: `echo_sid=${t1Sid}` } },
    );
    assert.equal(
      mutualFriendsSharedServer.status,
      200,
      await mutualFriendsSharedServer.text(),
    );

    const dmOpenMutualServer = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ peerUserId: t4.user.id }),
    });
    const dmOpenMutualServerBody = await dmOpenMutualServer.text();
    assert.equal(dmOpenMutualServer.status, 200, dmOpenMutualServerBody);
    const dmOpenMutualServerJson = JSON.parse(dmOpenMutualServerBody) as {
      channelId: string;
    };
    assert.ok(dmOpenMutualServerJson.channelId);

    s2.emit('joinChannel', defaultChannelId);
    await new Promise((r) => setTimeout(r, 800));

    const editCorrelationId = randomUUID();
    const editDenied = await new Promise<{
      code?: string;
      correlationId?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timeout message:edit message_failed')),
        8000,
      );
      s2.once('message_failed', (p: any) => {
        clearTimeout(timer);
        resolve(p);
      });
      s2.emit('message:edit', {
        channelId: defaultChannelId,
        messageId: savedMsgId!,
        content: 'hijack attempt',
        correlationId: editCorrelationId,
      });
    });
    assert.equal(editDenied.code, 'FORBIDDEN');
    assert.equal(editDenied.correlationId, editCorrelationId);

    const delistAfterT2Join = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ listedInDirectory: false }),
      },
    );
    assert.equal(delistAfterT2Join.status, 204, await delistAfterT2Join.text());

    // --- Guest carve-out DM tests ---
    // Guests are minted via `/api/v1/auth/guest` (returns 201 for a fresh mint).
    const guestRes = await fetch(`${baseUrl}/api/v1/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(guestRes.status, 201, await guestRes.clone().text());
    const guestBody = await guestRes.text();
    const guest = JSON.parse(guestBody) as {
      user: { id: string };
      csrfToken: string;
    };
    const guestSid = guestRes.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];

    // Guests cannot open DMs via REST (default-deny write guard).
    const guestDmStranger = await fetch(`${baseUrl}/api/v1/echo/dm/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': guest.csrfToken,
        cookie: `echo_sid=${guestSid}`,
      },
      body: JSON.stringify({ peerUserId: t2UserId }),
    });
    assert.equal(guestDmStranger.status, 403, await guestDmStranger.text());

    // Friend request *to* a guest is forbidden (guests cannot use friends).
    const friendReqToGuest = await fetch(
      `${baseUrl}/api/v1/echo/friends/request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ peerId: guest.user.id }),
      },
    );
    const friendReqToGuestBody = await friendReqToGuest.text();
    assert.equal(friendReqToGuest.status, 403, friendReqToGuestBody);

    // --- Global DM Search Test ---
    const searchDmRes = await fetch(
      `${baseUrl}/api/v1/echo/dm/messages/search?q=pipeline`,
      {
        headers: { cookie: `echo_sid=${t1Sid}` },
      },
    );
    assert.equal(searchDmRes.status, 200);
    const searchDmJson = (await searchDmRes.json()) as { messages: any[] };
    assert.ok(Array.isArray(searchDmJson.messages));

    // --- Group DM Rename Test ---
    const patchRename = await fetch(
      `${baseUrl}/api/v1/echo/dm/group/${encodeURIComponent(grpJson.channelId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': g4.csrfToken,
          cookie: `echo_sid=${g4.sid}`,
        },
        body: JSON.stringify({ name: 'Renamed Group' }),
      },
    );
    assert.equal(patchRename.status, 204);

    // --- Edit/Delete/Socket Event Parity ---
    const editMsg = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages/${encodeURIComponent(savedMsgId!)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ content: 'pipeline edited' }),
      },
    );
    assert.equal(editMsg.status, 204);

    // Socket edit
    const socketEditClientId = randomUUID();
    const socketEditId = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('timeout waiting for socket edit message_ack')),
        15_000,
      );
      s1.once('message_ack', (payload: { message?: { id?: string } }) => {
        clearTimeout(t);
        const id = payload?.message?.id?.trim();
        if (!id) {
          reject(new Error('message_ack missing persisted id'));
          return;
        }
        resolve(id);
      });
      s1.emit('message', {
        channelId: defaultChannelId,
        content: 'to edit',
        id: socketEditClientId,
      });
    });
    await pollChannelMessage(baseUrl, defaultChannelId, socketEditId, t1Sid!, {
      expectedContent: 'to edit',
      timeoutMs: 15_000,
    });
    s1.emit('message:edit', {
      channelId: defaultChannelId,
      messageId: socketEditId,
      content: 'edited via socket',
    });
    const edited = await pollChannelMessage(
      baseUrl,
      defaultChannelId,
      socketEditId,
      t1Sid!,
      { expectedContent: 'edited via socket', timeoutMs: 15_000 },
    );
    assert.equal(edited.content, 'edited via socket');

    // --- Banned User Enforcement ---
    const badModAction = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/moderation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({
          action: 'not_a_supported_moderation_action',
          targetUserId: t2UserId,
        }),
      },
    );
    assert.equal(badModAction.status, 400, await badModAction.text());

    const banRes = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/moderation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({
          action: 'ban',
          targetUserId: t2UserId,
          reason: 'Test ban',
        }),
      },
    );
    assert.equal(banRes.status, 204);

    const postBanContent = `post-ban no leak ${randomUUID()}`;
    let postBanSend!: Promise<any>;
    const leakedAfterBan = await new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onMessage = (m: any) => {
        if (m?.content === postBanContent) {
          cleanup();
          resolve(true);
        }
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        s2.off('message', onMessage);
      };
      timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 1200);
      s2.on('message', onMessage);
      postBanSend = fetch(
        `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': t1.csrfToken,
            cookie: `echo_sid=${t1Sid}`,
          },
          body: JSON.stringify({
            channelId: defaultChannelId,
            content: postBanContent,
            id: randomUUID(),
          }),
        },
      );
    });
    const postBanRes = await postBanSend;
    assert.equal(postBanRes.status, 201, await postBanRes.text());
    assert.equal(
      leakedAfterBan,
      false,
      'Banned user should be evicted from realtime channel fan-out',
    );

    const joinBanned = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t2.csrfToken,
          cookie: `echo_sid=${t2Sid}`,
        },
      },
    );
    assert.equal(
      joinBanned.status,
      403,
      'Banned user should not be able to join',
    );

    // --- Unknown Channel ---
    const unknownChannelId = randomUUID();
    const unknownJoin = await new Promise<{ code?: string }>((resolve) => {
      s1.once('message_failed', (p: any) => resolve(p));
      s1.emit('joinChannel', unknownChannelId);
      s1.emit('message', {
        channelId: unknownChannelId,
        content: 'fail',
        id: randomUUID(),
      });
    });
    assert.equal(unknownJoin.code, 'UNKNOWN_CHANNEL');

    s1.disconnect();
    s2.disconnect();
    console.log('echo.pipeline.integration: ok');
  } finally {
    await close();
  }
}

run()
  .then(() => {
    // Force exit so dangling open handles (Redis rate-limit clients, scheduled VC
    // reconcile timers, NATS adapters, etc.) don't keep the Node process alive
    // for minutes after the integration test finishes asserting.
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
