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
} from '../domain/echoStore';
import { buildEchoTestApp } from './helpers/echoTestApp';
import { attachSocketAdapterIfConfigured } from '../bootstrap/socket';
import { config } from '../config';

async function run(): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool || !config.natsUrl) {
    console.log(
      'echo.multinode.integration: skip (no DATABASE_URL or NATS_URL / Echo disabled)',
    );
    return;
  }

  // Build two separate app instances
  const app1 = await buildEchoTestApp();
  const app2 = await buildEchoTestApp();

  // Attach NATS adapter to both
  await attachSocketAdapterIfConfigured(app1.fastify, app1.io);
  await attachSocketAdapterIfConfigured(app2.fastify, app2.io);

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

    // User 2 joins the server on App 2
    const inviteRes = await fetch(
      `${app1.baseUrl}/api/v1/echo/servers/${encodeURIComponent(serverId)}/invites`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': t1.csrfToken,
          cookie: `echo_sid=${t1Sid}`,
        },
      },
    );
    const { code } = (await inviteRes.json()) as { code: string };

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

    // Connect User 1 to App 1
    const s1: IoClientSocket = ioClient(app1.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    await new Promise<void>((resolve) => s1.on('connect', resolve));

    // Connect User 2 to App 2
    const s2: IoClientSocket = ioClient(app2.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `echo_sid=${t2Sid}` },
    });
    await new Promise<void>((resolve) => s2.on('connect', resolve));

    // Both join the channel
    s1.emit('joinChannel', defaultChannelId);
    s2.emit('joinChannel', defaultChannelId);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // --- TEST 1: Cross-node message fan-out ---
    const msgContent = 'hello from node 1';
    const msgReceived = new Promise<any>((resolve) => {
      s2.on('message', (m) => {
        if (m.content === msgContent) resolve(m);
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

    // --- TEST 2: Cross-node presence update ---
    // User 1 sets status to 'idle' on Node 1
    const presenceReceived = new Promise<any>((resolve) => {
      s2.on('presence:update', (p) => {
        if (p.userId === t1UserId && p.status === 'idle') resolve(p);
      });
    });

    s1.emit('presence:set', { status: 'idle' });
    await presenceReceived;
    console.log('TEST 2: Cross-node presence update OK');

    // --- TEST 3: Multi-node last-socket-offline semantics ---
    // Connect User 1 again to Node 2 (User 1 now has sockets on both nodes)
    const s1b: IoClientSocket = ioClient(app2.baseUrl, {
      transports: ['websocket'],
      extraHeaders: { cookie: `echo_sid=${t1Sid}` },
    });
    await new Promise<void>((resolve) => s1b.on('connect', resolve));

    // User 1 disconnects from Node 1
    // It should NOT trigger 'offline' because s1b is still connected on Node 2
    let offlineEmitted = false;
    s2.on('presence:update', (p) => {
      if (p.userId === t1UserId && p.status === 'offline') {
        offlineEmitted = true;
      }
    });

    s1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check DB status - should still be 'idle' (or whatever it was)
    const pres = await getEchoPresence(pool, [t1UserId]);
    assert.notEqual(
      pres[t1UserId],
      'offline',
      'User should not be offline while s1b is connected',
    );
    assert.equal(
      offlineEmitted,
      false,
      'Should not have emitted offline event',
    );
    console.log('TEST 3: Multi-node last-socket-offline (negative) OK');

    // Now disconnect s1b from Node 2
    const offlineReceived = new Promise<any>((resolve) => {
      s2.on('presence:update', (p) => {
        if (p.userId === t1UserId && p.status === 'offline') resolve(p);
      });
    });

    s1b.disconnect();
    await offlineReceived;

    const presFinal = await getEchoPresence(pool, [t1UserId]);
    assert.equal(presFinal[t1UserId], 'offline');
    console.log('TEST 3: Multi-node last-socket-offline (positive) OK');

    s1.disconnect();
    s1b.disconnect();
    s2.disconnect();
    console.log('echo.multinode.integration: ok');
  } finally {
    await app1.close();
    await app2.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
