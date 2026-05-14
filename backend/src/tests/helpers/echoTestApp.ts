import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { attachSocketServer } from '../../bootstrap/socket';
import { ECHO_CORS_ALLOWED_HEADERS } from '../../bootstrap/httpPlugins';
import { registerRoutes } from '../../api/routes';
import { getAccessUserIdFromAuthHeader } from '../../auth/token';

/** Minimal HTTP stack for integration tests (no Helmet — avoids blocking Socket.IO upgrades in CI). */
async function registerTestHttpPlugins(
  fastify: FastifyInstance,
): Promise<void> {
  await fastify.register(rateLimit, {
    max: 10000,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const userId = getAccessUserIdFromAuthHeader(req.headers.authorization);
      return userId ? `uid:${userId}` : `ip:${req.ip}`;
    },
  });
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [...ECHO_CORS_ALLOWED_HEADERS],
  });
  await fastify.register(cookie);
}

/**
 * Full Fastify + Socket.IO + routes for integration tests (no presence sweep job).
 */
export async function buildEchoTestApp(): Promise<{
  fastify: ReturnType<typeof Fastify>;
  io: import('socket.io').Server;
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const fastify = Fastify({ logger: false });
  const io = attachSocketServer(fastify);
  await registerTestHttpPlugins(fastify);
  await registerRoutes(fastify);
  await fastify.listen({ port: 0, host: '127.0.0.1' });
  const addr = fastify.server.address() as AddressInfo;
  const port = addr.port;
  return {
    fastify,
    io,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await fastify.close();
    },
  };
}
