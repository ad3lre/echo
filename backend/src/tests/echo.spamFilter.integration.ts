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
      console.log('echo.spamFilter.integration: skip (Echo store unavailable)');
      return;
    }
    throw e;
  }
  if (!enabled || !pool) {
    console.log(
      'echo.spamFilter.integration: skip (no DATABASE_URL / Echo disabled)',
    );
    return;
  }

  const { baseUrl, close } = await buildEchoTestApp();
  const ownerUsername = `spam_owner_${Date.now().toString(36)}`;
  const memberUsername = `spam_member_${Date.now().toString(36)}`;

  try {
    const ownerReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: ownerUsername,
        password: 'password123',
        email: `${ownerUsername}@echo.test`,
        displayName: 'Spam Filter Owner',
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
        displayName: 'Spam Filter Member',
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
      body: JSON.stringify({ name: 'Spam Filter Server' }),
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

    const socket: IoClientSocket = ioClient(baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${memberSid}` },
    });

    try {
      await waitForSocketConnect(socket);
      socket.emit('joinChannel', defaultChannelId);
      await new Promise<void>((resolve) => setTimeout(resolve, 800));

      const repeatedContent = 'repeat me';
      const first = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(first.kind, 'message');

      const second = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(second.kind, 'message');

      const third = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(third.kind, 'message');

      const fourth = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(fourth.kind, 'message');

      const blocked = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(blocked.kind, 'failed');
      assert.equal(blocked.payload.code, 'SPAM_FILTER');

      const patchPrefs = await fetch(
        `${baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': ownerAuth.csrfToken,
            cookie: `echo_sid=${ownerSid}`,
          },
          body: JSON.stringify({ automodSpamEnabled: false }),
        },
      );
      assert.equal(patchPrefs.status, 204, await patchPrefs.text());

      const workspace = await fetch(`${baseUrl}/api/v1/echo/workspace`, {
        headers: { cookie: `echo_sid=${memberSid}` },
      });
      const workspaceBody = await workspace.text();
      assert.equal(workspace.status, 200, workspaceBody);
      const workspaceJson = JSON.parse(workspaceBody) as {
        servers: Array<{ id: string; automodSpamEnabled?: boolean }>;
      };
      assert.equal(
        workspaceJson.servers.find((s) => s.id === serverId)
          ?.automodSpamEnabled,
        false,
      );

      const allowedAfterDisable = await sendSocketMessage(
        socket,
        defaultChannelId,
        repeatedContent,
      );
      assert.equal(allowedAfterDisable.kind, 'message');
    } finally {
      socket.disconnect();
    }

    console.log('echo.spamFilter.integration: ok');
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
