import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import { getEchoStore } from '../domain/echoStore';
import { buildEchoTestApp } from './helpers/echoTestApp';

type SocketSendResult =
  | { kind: 'message'; payload: Record<string, unknown> }
  | { kind: 'failed'; payload: Record<string, unknown> };

async function waitForSocketConnect(socket: IoClientSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      15000,
    );
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function sendSocketMessage(
  socket: IoClientSocket,
  channelId: string,
  content: string,
): Promise<SocketSendResult> {
  const id = randomUUID();
  return new Promise<SocketSendResult>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for socket send result (${id})`)),
      8000,
    );
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('message_failed', onFailed);
    };
    const onMessage = (payload: Record<string, unknown>) => {
      if (String(payload.id ?? '') !== id) return;
      cleanup();
      resolve({ kind: 'message', payload });
    };
    const onFailed = (payload: Record<string, unknown>) => {
      if (String(payload.clientMessageId ?? '') !== id) return;
      cleanup();
      resolve({ kind: 'failed', payload });
    };
    socket.on('message', onMessage);
    socket.on('message_failed', onFailed);
    socket.emit('message', { channelId, content, id });
  });
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
      console.log('echo.automod.integration: skip (Echo store unavailable)');
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log(
      'echo.automod.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const ownerUsername = `am_owner_${Date.now().toString(36)}`;
  const memberUsername = `am_member_${Date.now().toString(36)}`;

  try {
    const ownerReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: ownerUsername,
        password: 'password123',
        email: `${ownerUsername}@echo.test`,
        displayName: 'AutoMod Owner',
      }),
    });
    const ownerRegBody = await ownerReg.text();
    assert.equal(ownerReg.status, 201, ownerRegBody);
    const ownerAuth = JSON.parse(ownerRegBody) as { csrfToken: string };
    const ownerSid = ownerReg.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    assert.ok(ownerSid, 'missing owner session cookie');

    const memberReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: memberUsername,
        password: 'password123',
        email: `${memberUsername}@echo.test`,
        displayName: 'AutoMod Member',
      }),
    });
    const memberRegBody = await memberReg.text();
    assert.equal(memberReg.status, 201, memberRegBody);
    const memberAuth = JSON.parse(memberRegBody) as { csrfToken: string };
    const memberSid = memberReg.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    assert.ok(memberSid, 'missing member session cookie');

    const createServer = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': ownerAuth.csrfToken,
        cookie: `echo_sid=${ownerSid}`,
      },
      body: JSON.stringify({ name: 'AutoMod Integration Server' }),
    });
    const createServerBody = await createServer.text();
    assert.equal(createServer.status, 201, createServerBody);
    const { serverId, defaultChannelId } = JSON.parse(createServerBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const joinServer = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': memberAuth.csrfToken,
          cookie: `echo_sid=${memberSid}`,
        },
      },
    );
    assert.equal(joinServer.status, 200, await joinServer.text());

    const ruleBody = {
      name: 'Block phrase',
      icon: 'shield',
      enabled: true,
      triggerType: 'message.create',
      conditionTree: {
        kind: 'group',
        combinator: 'AND',
        children: [
          {
            kind: 'condition',
            field: 'message.content',
            op: 'contains',
            value: 'AUTOMOD_BLOCKME',
          },
        ],
      },
      actions: [{ kind: 'block_message', phase: 'pre_send' }],
      exemptRoleIds: [] as string[],
      exemptChannelIds: [] as string[],
      logChannelId: null as string | null,
    };

    const createRule = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/automod/rules`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': ownerAuth.csrfToken,
          cookie: `echo_sid=${ownerSid}`,
        },
        body: JSON.stringify(ruleBody),
      },
    );
    const createRuleText = await createRule.text();
    assert.equal(createRule.status, 201, createRuleText);
    const { rule: createdRule } = JSON.parse(createRuleText) as {
      rule: { id: string };
    };
    const ruleId = createdRule.id;

    const listRules = await fetch(
      `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/automod/rules`,
      {
        headers: { cookie: `echo_sid=${ownerSid}` },
      },
    );
    const listRulesText = await listRules.text();
    assert.equal(listRules.status, 200, listRulesText);
    const listJson = JSON.parse(listRulesText) as {
      rules: { id: string }[];
    };
    assert.equal(listJson.rules.length, 1);
    assert.equal(listJson.rules[0].id, ruleId);

    const socket: IoClientSocket = ioClient(baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${memberSid}` },
    });

    try {
      await waitForSocketConnect(socket);
      socket.emit('joinChannel', defaultChannelId);
      await new Promise<void>((resolve) => setTimeout(resolve, 800));

      const okMsg = await sendSocketMessage(
        socket,
        defaultChannelId,
        'hello automod',
      );
      assert.equal(okMsg.kind, 'message');

      const blocked = await sendSocketMessage(
        socket,
        defaultChannelId,
        'please AUTOMOD_BLOCKME now',
      );
      assert.equal(blocked.kind, 'failed');
      assert.equal(blocked.payload.code, 'AUTOMOD_BLOCKED');

      const patchExempt = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': ownerAuth.csrfToken,
            cookie: `echo_sid=${ownerSid}`,
          },
          body: JSON.stringify({
            exemptChannelIds: [defaultChannelId],
          }),
        },
      );
      assert.equal(patchExempt.status, 200, await patchExempt.text());

      const allowedInExempt = await sendSocketMessage(
        socket,
        defaultChannelId,
        'AUTOMOD_BLOCKME exempted',
      );
      assert.equal(allowedInExempt.kind, 'message');

      const del = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}`,
        {
          method: 'DELETE',
          headers: {
            'x-csrf-token': ownerAuth.csrfToken,
            cookie: `echo_sid=${ownerSid}`,
          },
        },
      );
      assert.equal(del.status, 204, await del.text());

      const listAfter = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/automod/rules`,
        {
          headers: { cookie: `echo_sid=${ownerSid}` },
        },
      );
      const listAfterText = await listAfter.text();
      assert.equal(listAfter.status, 200, listAfterText);
      const afterJson = JSON.parse(listAfterText) as {
        rules: unknown[];
      };
      assert.equal(afterJson.rules.length, 0);
    } finally {
      socket.disconnect();
    }

    console.log('echo.automod.integration: ok');
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
