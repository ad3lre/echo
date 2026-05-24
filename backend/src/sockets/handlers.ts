import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { config } from '../config';
import { applyPresenceSignal } from '../domain/echoPresenceAuthority';
import {
  filterVisibleEchoUserIds,
  getEchoStore,
  listEchoServerIdsForUser,
  upsertEchoPresence,
} from '../domain/echoStore';
import { resolveSocketIdentity } from './resolveSocketIdentity';
import { attachSocketEventLogger } from './eventMiddleware';
import { registerChannelHandlers } from './channelHandlers';
import { registerMessageHandler } from './chatMessageHandler';
import { registerMessageEditDeleteHandler } from './messageEditDeleteHandler';
import { registerMessageReactionHandler } from './messageReactionHandler';
import { registerMessagePinHandler } from './messagePinHandler';
import { registerPresenceHandler } from './presenceHandler';
import { registerDmCallSignalHandler } from './dmCallSignalHandler';
import {
  registerEchoPresenceSocket,
  unregisterEchoPresenceSocket,
} from './presenceSocketRegistry';
import {
  registerUserSocket,
  unregisterUserSocket,
  getAllConnectedUserIds,
} from './userSocketIndex';
import { registerPollVoteHandler } from './pollVoteHandler';
import { registerTypingHandler } from './typingHandler';
import { registerPaperWatchHandler } from './paperWatchHandler';
import { registerPaperCollabHandler } from './paperCollabHandler';
import { appendBackendDiagnostic } from '../observability/sessionDiagnostics';
import { touchAuthUserLastSeenIp } from '../auth/authUserLastSeenIp';
import { clientIpFromSocketHandshake } from '../net/clientIp';
import { pruneOfflineUsersFromAllVoiceChannels } from '../services/echoVoiceOfflineCleanup';
import { reconcileEchoVoiceParticipantsForUserAgainstLiveKit } from '../services/echoVoiceLiveKitReconcile';

import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../../shared/types';

// Keep aligned with Socket.IO `connectionStateRecovery.maxDisconnectionDuration`.
const VOICE_OFFLINE_PRUNE_GRACE_MS = 2 * 60 * 1000;

/** Debounced LiveKit vs DB check after any Echo disconnect (VC ghost cleanup). */
const VOICE_USER_LK_RECONCILE_AFTER_DISCONNECT_MS = 12_000;

const voiceUserLiveKitReconcileTimers = new Map<string, NodeJS.Timeout>();

function scheduleEchoVoiceUserLiveKitReconcile(
  fastify: FastifyInstance,
  userId: string,
): void {
  const prev = voiceUserLiveKitReconcileTimers.get(userId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    voiceUserLiveKitReconcileTimers.delete(userId);
    void (async () => {
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) return;
      try {
        await reconcileEchoVoiceParticipantsForUserAgainstLiveKit({
          fastify,
          pool,
          userId,
          reason: 'socket_follow_up',
          log: fastify.log,
        });
      } catch (e) {
        fastify.log.error(
          e,
          'voice.user_livekit_reconcile_after_disconnect_failed',
        );
      }
    })();
  }, VOICE_USER_LK_RECONCILE_AFTER_DISCONNECT_MS);
  voiceUserLiveKitReconcileTimers.set(userId, t);
}

// Define a type for our specific Socket instance to use throughout the handlers.
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

function socketHandshakeCorrelationId(socket: IoSocket): string | undefined {
  const h = socket.handshake.headers['x-request-id'];
  const raw = Array.isArray(h) ? h[0] : h;
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (t.length === 0 || t.length > 128) return undefined;
  return t;
}

/**
 * Registers all Socket.IO event handlers for the application.
 * This modular approach keeps the main `index.ts` file clean and focused on server setup.
 *
 * @param {FastifyInstance} fastify - The Fastify instance, which has been decorated with the `io` server.
 */
export function registerSocketHandlers(fastify: FastifyInstance): void {
  const { io, log } = fastify;

  // Resolve identity in a middleware so it runs BEFORE the `connection` event.
  // This lets us register event handlers synchronously in the connection callback,
  // avoiding a race where the client emits early events (e.g. `joinChannel`) before
  // async identity resolution finishes and listeners are attached. Without this,
  // those events are silently dropped because no `socket.on(...)` is wired yet.
  io.use((socket, next) => {
    void (async () => {
      try {
        const identity = await resolveSocketIdentity(
          socket.handshake,
          log,
          socket.id,
        );
        socket.data.userId = identity.userId;
        socket.data.authSessionId = identity.authSessionId;
        socket.data.authenticated = identity.authenticated;
        socket.data.isGuest = identity.isGuest;
        socket.data.profileStatus = identity.profileStatus;

        const requireSocketAuth =
          config.authRequireSocketToken || config.isProduction;
        if (requireSocketAuth && !identity.authenticated) {
          return next(new Error('Unauthorized'));
        }
        next();
      } catch (err) {
        log.error(
          { err, socketId: socket.id },
          'Socket identity resolve threw',
        );
        next(err as Error);
      }
    })();
  });

  io.on('connection', (socket: IoSocket) => {
    const authenticated = socket.data.authenticated ?? false;

    const requireSocketAuth =
      config.authRequireSocketToken || config.isProduction;
    if (requireSocketAuth && !authenticated) {
      log.warn(
        { socketId: socket.id },
        'Socket rejected: JWT required (AUTH_REQUIRE_SOCKET_TOKEN or production)',
      );
      socket.disconnect(true);
      return;
    }

    if (authenticated) {
      log.info(
        `Socket connected: ${socket.id} (auth user: ${socket.data.userId})`,
      );
    }
    log.info(`Socket connected: ${socket.id} (user: ${socket.data.userId})`);
    void appendBackendDiagnostic({
      level: 'info',
      domain: 'socket',
      event: 'socket_connected',
      stage: 'start',
      traceId: socketHandshakeCorrelationId(socket),
      context: {
        userId: socket.data.userId,
        authenticated,
        recovered: socket.recovered,
        transport: socket.conn.transport.name,
      },
    });

    if (authenticated && !socket.data.userId.startsWith('user_')) {
      registerEchoPresenceSocket(socket.data.userId);
      registerUserSocket(socket.data.userId, socket.id);
      socket.join(`echo:user:${socket.data.userId}`);
      void (async () => {
        const { pool, enabled } = await getEchoStore();
        if (!enabled || !pool) return;
        const ip = clientIpFromSocketHandshake(
          socket.handshake.headers as Record<
            string,
            string | string[] | undefined
          >,
          socket.handshake.address,
          config.trustProxy,
        );
        await touchAuthUserLastSeenIp(pool, socket.data.userId, ip);
        try {
          const serverIds = await listEchoServerIdsForUser(
            pool,
            socket.data.userId,
          );
          for (const sid of serverIds) {
            socket.join(`echo:server:${sid}`);
          }
        } catch (err) {
          log.warn(
            { err, userId: socket.data.userId },
            'echo_server_socket_scope_bootstrap_failed',
          );
        }
      })();
    }

    attachSocketEventLogger(socket, log);
    registerChannelHandlers(socket, log, socket.data.userId, { authenticated });
    registerMessageHandler(fastify, socket, io, log, socket.data.userId, {
      authenticated,
      handshakeCorrelationId: socketHandshakeCorrelationId(socket),
    });
    registerMessageEditDeleteHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerMessageReactionHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerMessagePinHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerPresenceHandler(socket, io, log, socket.data.userId, {
      authenticated,
      profileStatus: socket.data.profileStatus,
    });
    registerDmCallSignalHandler(socket, io, log, socket.data.userId, {
      authenticated,
      isGuest: socket.data.isGuest ?? false,
    });
    registerPollVoteHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerTypingHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerPaperWatchHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });
    registerPaperCollabHandler(socket, io, log, socket.data.userId, {
      authenticated,
    });

    // Handle any socket-level errors.
    socket.on('error', (err) => {
      log.error(err, `Socket error from ${socket.id}`);
    });

    // Handle client disconnection: mark offline only when this is the last Echo socket for the user on this process.
    socket.on('disconnect', (reason) => {
      log.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
      void appendBackendDiagnostic({
        level: 'info',
        domain: 'socket',
        event: 'socket_disconnected',
        stage: 'end',
        traceId: socketHandshakeCorrelationId(socket),
        context: {
          userId: socket.data.userId,
          authenticated,
          recovered: socket.recovered,
          reason,
        },
      });
      if (!authenticated || socket.data.userId.startsWith('user_')) return;
      const uid = socket.data.userId;
      unregisterUserSocket(uid, socket.id);
      const remaining = unregisterEchoPresenceSocket(uid);
      if (config.liveKitEnabled) {
        scheduleEchoVoiceUserLiveKitReconcile(fastify, uid);
      }
      if (remaining > 0) return;
      void (async () => {
        const { enabled, pool } = await getEchoStore();
        if (!enabled || !pool) return;
        try {
          // In a multi-node setup, we check if the user has sockets on other nodes.
          // The NATS adapter doesn't provide a cross-node socket count directly.
          // We use a short delay to allow for same-node reconnects, then check if any sockets remain.
          // For true cross-node last-socket, we'd need Redis.
          // However, we can improve this by broadcasting a 'presence:check_offline' internal event.
          // For now, we'll stick to the plan of coordinating via the adapter if possible,
          // or acknowledging that heartbeat TTL is the cluster-wide backstop.

          // IMPROVEMENT: Broadcast a request to other nodes to see if they have sockets for this user.
          // Since we don't have a request-response pattern over the adapter easily,
          // we will emit an internal event that other nodes can respond to if they HAVE the user.
          // But wait, the adapter already handles room broadcasts.
          // If we join a per-user room `echo:user:${uid}`, we can use `io.in(room).fetchSockets()`
          // but that only returns LOCAL sockets for the current node even with an adapter (usually).

          // Actually, socket.io-nats-adapter's fetchSockets() DOES support cluster-wide if configured.
          const allSockets = await io.in(`echo:user:${uid}`).fetchSockets();
          if (allSockets.length > 0) {
            log.info(
              { uid, count: allSockets.length },
              'Last socket on this node dropped, but user has sockets on other nodes',
            );
            return;
          }

          const occurredAtMs = Date.now();
          const next = applyPresenceSignal(undefined, {
            source: 'disconnect',
            occurredAtMs,
          });
          if (!next) return;
          await upsertEchoPresence(pool, uid, next.status, 'web');
          const viewerIds = getAllConnectedUserIds();
          for (const viewerId of viewerIds) {
            if (viewerId === uid) {
              io.to(`echo:user:${viewerId}`).emit('presence:update', {
                userId: uid,
                status: next.status,
                activeClient: 'web',
              });
              continue;
            }
            const visible = await filterVisibleEchoUserIds(pool, viewerId, [
              uid,
            ]);
            if (visible.includes(uid)) {
              io.to(`echo:user:${viewerId}`).emit('presence:update', {
                userId: uid,
                status: next.status,
                activeClient: 'web',
              });
            }
          }

          setTimeout(() => {
            void (async () => {
              try {
                const allSocketsAfter = await io
                  .in(`echo:user:${uid}`)
                  .fetchSockets();
                if (allSocketsAfter.length > 0) return;
                await pruneOfflineUsersFromAllVoiceChannels({
                  fastify,
                  pool,
                  userIds: [uid],
                  reason: 'socket_disconnect',
                  occurredAtMs,
                  log,
                });
              } catch (e) {
                log.error(e, 'voice.offline_prune_after_disconnect_failed');
              }
            })();
          }, VOICE_OFFLINE_PRUNE_GRACE_MS);
        } catch (e) {
          log.error(e, 'Failed to persist offline presence on disconnect');
        }
      })();
    });
  });

  log.info('Registered Socket.IO handlers and awaiting connections');
}
