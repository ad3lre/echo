import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';

/** Route gateway upgrades through Fastify without also handling Engine.IO sockets. */
export async function registerGatewayWebsocket(
  fastify: FastifyInstance,
): Promise<void> {
  const upgrades = createServer();
  const forward = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url?.startsWith('/socket.io/')) return;
    upgrades.emit('upgrade', request, socket, head);
  };
  await fastify.register(websocket, { options: { server: upgrades } });
  fastify.server.on('upgrade', forward);
  fastify.addHook('onClose', async () => {
    fastify.server.removeListener('upgrade', forward);
    upgrades.removeAllListeners();
  });
}
