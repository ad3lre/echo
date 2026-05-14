import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { registerSocketHandlers } from '../sockets/handlers';
import { connectNats } from '../db/nats';
import { createAdapter } from '@mickl/socket.io-nats-adapter';

function resolveSocketIoCorsOrigin():
  | string
  | string[]
  | RegExp
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean | string) => void,
    ) => void) {
  if (config.corsOrigin === true) {
    return (origin, callback) => {
      callback(null, origin ?? true);
    };
  }
  return config.corsOrigin;
}

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export function attachSocketServer(fastify: FastifyInstance): Server {
  const io = new Server(fastify.server, {
    /** Client bundle ships from the SPA; disabling avoids extra `request` wrapping that can interact badly with Fastify's handler chain. */
    serveClient: false,
    /**
     * Some CDNs / reverse proxies mishandle WebSocket permessage-deflate; Edge may surface that as
     * “Invalid frame header”. Disabling trades a bit of bandwidth for reliability on chat-echo.com.
     */
    perMessageDeflate: false,
    cors: {
      origin: resolveSocketIoCorsOrigin(),
      credentials: true,
      methods: ['GET', 'POST'],
    },
    /**
     * Connection state recovery allows clients to reconnect without losing state (e.g. room joins).
     * This is especially important for multi-node setups where a client might land on a different replica.
     */
    connectionStateRecovery: {
      // the backup duration of the sessions and the packets
      maxDisconnectionDuration: 2 * 60 * 1000,
      // whether to expose backup data over the adapter
      skipMiddlewares: true,
    },
    /**
     * Tuning ping parameters for faster detection of stale connections.
     */
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  fastify.decorate('io', io);
  registerSocketHandlers(fastify);
  return io;
}

export async function attachSocketAdapterIfConfigured(
  fastify: FastifyInstance,
  io: Server,
): Promise<void> {
  if (!config.natsUrl) {
    fastify.log.info('NATS not configured, using default Socket.IO adapter');
    return;
  }

  try {
    const nc = await connectNats();
    if (!nc) return;
    io.adapter(createAdapter(nc));
    fastify.log.info('NATS connected, Socket.IO adapter attached');
  } catch (err) {
    fastify.log.warn(
      { err },
      'NATS_URL is set but NATS is unreachable; using default Socket.IO adapter (single process). Start NATS (e.g. `docker compose up -d nats`) or unset NATS_URL for local dev.',
    );
  }
}
