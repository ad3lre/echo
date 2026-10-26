import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { registerSocketHandlers } from '../sockets/handlers';
import { subscribeToEchoChannelFanout } from '../sockets/channelFanoutTransport';
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

/**
 * CORS protects the polling handshake, while `allowRequest` also gates the
 * WebSocket upgrade itself. Keep both checks aligned so an untrusted browser
 * origin cannot bypass the configured origin policy by selecting websocket
 * transport directly. Non-browser clients normally omit Origin and remain
 * supported.
 */
function isSocketOriginAllowed(origin: string | undefined): boolean {
  if (!origin || config.corsOrigin === true) return true;
  if (typeof config.corsOrigin === 'string') {
    return origin === config.corsOrigin;
  }
  return config.corsOrigin.includes(origin);
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
    /**
     * Explicit inbound packet cap (socket.io default is 1 MB). Kept at 1 MB rather than 256 KB
     * because socket message/paper payloads can legitimately carry larger inline data; override via env.
     */
    maxHttpBufferSize: (() => {
      const n = parseInt(
        process.env.ECHO_SOCKET_MAX_HTTP_BUFFER_BYTES ?? '',
        10,
      );
      return Number.isFinite(n) && n >= 16 * 1024 ? n : 1_000_000;
    })(),
    cors: {
      origin: resolveSocketIoCorsOrigin(),
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowRequest: (req, callback) => {
      const origin =
        typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
      callback(null, isSocketOriginAllowed(origin));
    },
    /**
     * Connection state recovery allows clients to reconnect without losing state (e.g. room joins).
     * This is especially important for multi-node setups where a client might land on a different replica.
     */
    connectionStateRecovery: {
      // the backup duration of the sessions and the packets
      maxDisconnectionDuration: 2 * 60 * 1000,
      // whether to expose backup data over the adapter
      skipMiddlewares: false,
    },
    /**
     * Tuning ping parameters for faster detection of stale connections.
     */
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  fastify.decorate('io', io);
  fastify.addHook('onClose', async () => {
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  });
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
  // Configured cross-node transport is required before accepting traffic.
  // Let startup fail so the process supervisor can retry when NATS recovers.
  const nc = await connectNats();
  if (!nc) throw new Error('Configured NATS connection is unavailable');
  io.adapter(createAdapter(nc));
  subscribeToEchoChannelFanout(io, nc);
  fastify.log.info('NATS connected, Socket.IO adapter attached');
}
