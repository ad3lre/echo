import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { EchoVcActivityKey } from '../../cores/vcActivityCatalog';
import { GAME_C2S, GAME_S2C, type GameActionMsg } from '../../cores/games';
import { gameServerConfig } from '../config';
import {
  gameServerActionsTotal,
  gameServerActiveInstances,
  gameServerConnectionsTotal,
} from '../metrics';
import { RoomManager } from '../core/RoomManager';
import type { GameEmitter } from '../core/GameInstance';
import { gameModules } from '../games/registry';
import { verifyGameToken } from '../auth/verifyGameToken';
import { MembershipTracker } from './membership';
import { TunneledMembership } from './tunneledMembership';
import { createEchoRelayPoster } from './echoRelayPoster';
import { makeCompositeEmitter } from './compositeEmitter';
import { registerInternalGameRoutes } from '../http/internalGameRoutes';

interface GameSocketData {
  userId: string;
  username: string;
  roomId: string;
  gameKey: EchoVcActivityKey;
}

const roomChannel = (roomId: string): string => `r:${roomId}`;
const userChannel = (roomId: string, userId: string): string =>
  `u:${roomId}:${userId}`;

function readHandshakeToken(handshake: {
  auth?: unknown;
  headers?: Record<string, unknown>;
}): string | undefined {
  const t = (handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof t === 'string' && t) return t;
  const auth = handshake.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return undefined;
}

/**
 * Per-viewer emitter built over Socket.IO rooms: a snapshot for a user is sent
 * to `u:<room>:<user>` (all that user's sockets, and across nodes via the NATS
 * adapter). Per-user channels are what let `serializeFor` redact per viewer.
 */
function makeSocketEmitter(io: Server, roomId: string): GameEmitter {
  return {
    snapshotToUser: (userId, msg) =>
      void io.to(userChannel(roomId, userId)).emit(GAME_S2C.snapshot, msg),
    eventToUser: (userId, msg) =>
      void io.to(userChannel(roomId, userId)).emit(GAME_S2C.event, msg),
    eventToRoom: (msg) =>
      void io.to(roomChannel(roomId)).emit(GAME_S2C.event, msg),
  };
}

export interface GameSocketServer {
  io: Server;
  manager: RoomManager;
  tunneled: TunneledMembership;
}

/**
 * Stand up the game-server Socket.IO endpoint on Fastify's HTTP server. Mirrors
 * `server/backend/src/bootstrap/socket.ts` (connectionStateRecovery for seamless
 * reconnect, perMessageDeflate off for proxy reliability).
 */
export function attachGameSocketServer(
  fastify: FastifyInstance,
): GameSocketServer {
  const io = new Server(fastify.server, {
    serveClient: false,
    perMessageDeflate: false,
    cors: {
      origin: gameServerConfig.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  const membership = new MembershipTracker();
  const tunneled = new TunneledMembership();
  const relay = createEchoRelayPoster({
    relayBaseUrl: gameServerConfig.echoRelayBaseUrl,
    forwardSecret: gameServerConfig.echoForwardSecret,
  });
  const manager = new RoomManager(
    gameModules,
    (roomId) => makeCompositeEmitter(io, roomId, tunneled, relay),
    (gameKey, delta) => gameServerActiveInstances.inc({ game: gameKey }, delta),
  );
  registerInternalGameRoutes(fastify, manager, tunneled);

  io.use((socket, next) => {
    try {
      const token = readHandshakeToken(socket.handshake);
      if (!token) throw new Error('missing token');
      const payload = verifyGameToken(token, gameServerConfig.gameTokenSecret);
      const data = socket.data as GameSocketData;
      data.userId = payload.sub;
      data.username = payload.username;
      data.roomId = payload.roomId;
      data.gameKey = payload.gameKey;
      next();
    } catch {
      gameServerConnectionsTotal.inc({ outcome: 'rejected' });
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, roomId, gameKey } = socket.data as GameSocketData;
    gameServerConnectionsTotal.inc({ outcome: 'accepted' });

    void socket.join(roomChannel(roomId));
    void socket.join(userChannel(roomId, userId));
    membership.add(roomId, userId);
    // Idempotent: creates the instance if needed, otherwise just (re)snapshots
    // this user — so a fresh tab / recovered socket gets current state.
    const joinErr = manager.join(roomId, gameKey, userId, Date.now());
    if (joinErr) socket.emit(GAME_S2C.error, { reason: joinErr });

    socket.on(GAME_C2S.action, (msg: GameActionMsg) => {
      if (!msg || msg.roomId !== roomId) {
        socket.emit(GAME_S2C.error, { reason: 'room_mismatch' });
        return;
      }
      if (typeof msg.type !== 'string' || !msg.type) {
        socket.emit(GAME_S2C.error, { reason: 'invalid_action' });
        return;
      }
      const err = manager.dispatch(
        roomId,
        userId,
        msg.type,
        msg.payload,
        Date.now(),
      );
      gameServerActionsTotal.inc({ game: gameKey, outcome: err ?? 'ok' });
      if (err) socket.emit(GAME_S2C.error, { reason: err });
    });

    socket.on(GAME_C2S.leave, () => {
      if (membership.remove(roomId, userId)) {
        manager.leave(roomId, userId, Date.now());
      }
    });

    socket.on('disconnect', () => {
      if (membership.remove(roomId, userId)) {
        manager.leave(roomId, userId, Date.now());
      }
    });
  });

  return { io, manager, tunneled };
}
