/**
 * Multi-node integration tests: HTTP + Socket.IO + NATS (requires DATABASE_URL and NATS_URL).
 * Run: npm run test:echo:multinode -w backend
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  io as ioClient,
  type Socket as IoClientSocket,
} from 'socket.io-client';
import {
  getEchoStore,
  upsertEchoPresence,
  getEchoPresence,
} from '../../domain/echoStore';
import { buildEchoTestApp } from '../helpers/echoTestApp';
import { attachSocketAdapterIfConfigured } from '../../bootstrap/socket';
import { config } from '../../config';

async function run(): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool || !config.natsUrl) {
    console.log(
      'echo.multinode.integration: skip (no DATABASE_URL or NATS_URL / Echo disabled)',
    );
    return;
  }
  console.log('multinode: store ready, building apps');

  const app1 = await buildEchoTestApp();
  const app2 = await buildEchoTestApp();
  console.log('multinode: apps built, attaching NATS');

  await attachSocketAdapterIfConfigured(app1.fastify, app1.io);
  await attachSocketAdapterIfConfigured(app2.fastify, app2.io);
  console.log('multinode: NATS attached, beginning tests');

  const u1 = `multi_u1_${Date.now().toString(36)}`;
  const u2 = `multi_u2_${Date.now().toString(36)}`;

  try {
    // Register User 1 on App 1
    const reg1 = await fetch(`${app1.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u1,
        password: 'password123',
        email: `${u1}@echo.test`,
        displayName: 'Multi1',
      }),
    });
    const t1 = (await reg1.json()) as {
      user: { id: string };
      csrfToken: string;
    };
    const t1Sid = reg1.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    const t1UserId = t1.user.id;

    // Register User 2 on App 2
    const reg2 = await fetch(`${app2.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: u2,
        password: 'password123',
        email: `${u2}@echo.test`,
        displayName: 'Multi2',
      }),
    });
    const t2 = (await reg2.json()) as {
      user: { id: string };
      csrfToken: string;
    };
    const t2Sid = reg2.headers
      .get('set-cookie')
      ?.split(';')
      .find((c) => c.trim().startsWith('echo_sid='))
      ?.split('=')[1];
    const t2UserId = t2.user.id;

    // Create a server and channel on App 1
    const srv = await fetch(`${app1.baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ name: 'Multi-node Server' }),
    });
    const { serverId, defaultChannelId } = (await srv.json()) as {
      serverId: string;
      defaultChannelId: string;
    };

    // User 2 joins the server on App 2. Set a vanity code first (invites now require one).
    const vanity = `mn${Date.now().toString(36)}`;
    const setVanity = await fetch(
      `${app1.baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/preferences`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({ vanityCode: vanity }),
      },
    );
    assert.equal(setVanity.status, 204, await setVanity.clone().text());
    const inviteRes = await fetch(
      `${app1.baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/invites`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
        body: JSON.stringify({}),
      },
    );
    assert.equal(inviteRes.status, 201, await inviteRes.clone().text());
    const inviteJson = (await inviteRes.json()) as {
      vanityCode?: string;
      code?: string;
    };
    const code = inviteJson.vanityCode ?? inviteJson.code ?? vanity;
    assert.ok(code, 'expected invite code');

    await fetch(
      `${app2.baseUrl}/api/v1/echo/invites/${encodeURIComponent(code)}/join`,
      {
        method: 'POST',
        headers: {
          'x-csrf-token': t2.csrfToken,
          cookie: `echo_sid=${t2Sid}`,
        },
      },
    );

    console.log('multinode: connecting socket s1');
    const s1: IoClientSocket = ioClient(app1.baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('s1 connect timeout')),
        15000,
      );
      s1.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      s1.on('connect_error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });
    console.log('multinode: s1 connected');

    const s2: IoClientSocket = ioClient(app2.baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t2Sid}` },
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('s2 connect timeout')),
        15000,
      );
      s2.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      s2.on('connect_error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });
    console.log('multinode: s2 connected');

    s1.emit('joinChannel', defaultChannelId);
    s2.emit('joinChannel', defaultChannelId);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log('multinode: joined channel on both sockets');

    const msgContent = 'hello from node 1';
    const msgReceived = new Promise<any>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('TEST 1: cross-node message fan-out timed out')),
        15000,
      );
      s2.on('message', (m) => {
        if (m.content === msgContent) {
          clearTimeout(t);
          resolve(m);
        }
      });
    });

    s1.emit('message', {
      channelId: defaultChannelId,
      content: msgContent,
      id: randomUUID(),
    });
    const received = await msgReceived;
    assert.equal(received.content, msgContent);
    console.log('TEST 1: Cross-node message fan-out OK');

    // TEST 2: Cross-node presence DB update via REST. The socket `presence:set` is a
    // no-op when the user already has a fresh active presence (server keeps the
    // authoritative profile status); use the REST endpoint so the desired status sticks.
    const setIdle = await fetch(`${app1.baseUrl}/api/v1/echo/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': t1.csrfToken,
        cookie: `echo_sid=${t1Sid}`,
      },
      body: JSON.stringify({ status: 'idle' }),
    });
    assert.equal(setIdle.status, 204, await setIdle.clone().text());
    let presIdle: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      presIdle = await getEchoPresence(pool, [t1UserId]);
      if (presIdle[t1UserId] === 'idle') break;
    }
    assert.equal(
      presIdle[t1UserId],
      'idle',
      'Cross-node presence DB write should reach idle within ~6s',
    );
    console.log('TEST 2: Cross-node presence (DB) OK');

    // TEST 3: Multi-node last-socket-offline (DB-only) — confirm presence is not
    // forced offline while a sibling socket on the other node is still alive.
    const s1b: IoClientSocket = ioClient(app2.baseUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('s1b connect timeout')),
        15000,
      );
      s1b.on('connect', () => {
        clearTimeout(t);
        resolve();
      });
      s1b.on('connect_error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    s1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pres = await getEchoPresence(pool, [t1UserId]);
    assert.notEqual(
      pres[t1UserId],
      'offline',
      'User should not be offline while s1b is connected',
    );
    console.log('TEST 3: Multi-node last-socket-offline (negative) OK');

    s1b.disconnect();
    let presFinal: Record<string, string> = {};
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      presFinal = await getEchoPresence(pool, [t1UserId]);
      if (presFinal[t1UserId] === 'offline') break;
    }
    assert.equal(presFinal[t1UserId], 'offline');
    console.log('TEST 3: Multi-node last-socket-offline (positive) OK');

    s2.disconnect();
    console.log('echo.multinode.integration: ok');
  } finally {
    await app1.close();
    await app2.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
