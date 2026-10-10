import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { io as connectClient } from 'socket.io-client';
import { config } from '../config';
import { disconnectNats } from '../db/nats';
import { attachSocketAdapterIfConfigured } from './socket';

test('configured NATS failure rejects startup instead of serving locally', async () => {
  const app = Fastify();
  const io = new Server(app.server);
  const original = config.natsUrl;
  try {
    Object.assign(config, { natsUrl: 'nats://127.0.0.1:1' });
    await assert.rejects(attachSocketAdapterIfConfigured(app, io));
    Object.assign(config, { natsUrl: null });
    await attachSocketAdapterIfConfigured(app, io);
  } finally {
    Object.assign(config, { natsUrl: original });
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  }
});

test(
  'available NATS attaches adapters and delivers events across nodes',
  {
    skip: !process.env.NATS_TEST_URL,
    timeout: 10_000,
  },
  async () => {
    const apps = [Fastify(), Fastify()];
    const servers = apps.map((app) => new Server(app.server));
    const original = config.natsUrl;
    const clients: ReturnType<typeof connectClient>[] = [];
    try {
      Object.assign(config, { natsUrl: process.env.NATS_TEST_URL });
      for (let i = 0; i < apps.length; i++) {
        await attachSocketAdapterIfConfigured(apps[i]!, servers[i]!);
        const url = await apps[i]!.listen({ host: '127.0.0.1', port: 0 });
        const client = connectClient(url, {
          transports: ['websocket'],
          reconnection: false,
        });
        clients.push(client);
        await once(client, 'connect');
      }
      const received = once(clients[1]!, 'review-event');
      servers[0]!.emit('review-event', 'cross-node delivery');
      assert.deepEqual(await received, ['cross-node delivery']);
    } finally {
      clients.forEach((client) => client.disconnect());
      for (let i = 0; i < apps.length; i++) {
        await new Promise<void>((resolve) =>
          servers[i]!.close(() => resolve()),
        );
        await apps[i]!.close();
      }
      await disconnectNats();
      Object.assign(config, { natsUrl: original });
    }
  },
);
