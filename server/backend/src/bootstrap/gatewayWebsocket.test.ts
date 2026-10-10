import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import WebSocket from 'ws';
import { registerGatewayWebsocket } from './gatewayWebsocket';

test('Fastify gateway and Socket.IO upgrades each have one owner', async () => {
  const app = Fastify();
  const io = new Server(app.server, { serveClient: false });
  await registerGatewayWebsocket(app);
  app.get('/gateway', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data));
  });
  const baseURL = await app.listen({ host: '127.0.0.1', port: 0 });
  const chat = connect(baseURL, {
    transports: ['websocket'],
    reconnection: false,
  });
  const gateway = new WebSocket(baseURL.replace('http:', 'ws:') + '/gateway');
  try {
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        chat.once('connect', resolve);
        chat.once('connect_error', reject);
      }),
      once(gateway, 'open'),
    ]);
    const echoed = once(gateway, 'message');
    gateway.send('gateway stays open');
    assert.equal(String((await echoed)[0]), 'gateway stays open');
    assert.equal(chat.connected, true);
  } finally {
    chat.disconnect();
    gateway.terminate();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  }
});
