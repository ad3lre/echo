import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import {
  GAME_C2S,
  GAME_S2C,
  type GameActionMsg,
  type GameJoinMsg,
  type GameLeaveMsg,
} from '../../../activities/cores/games';
import { config } from '../config';
import { canUserAccessChannel } from '../domain/permissions/echoPermissions';
import {
  getEchoChannelServerId,
  getEchoChannelType,
  getEchoStore,
} from '../domain/echoStore';
import {
  forwardGameAction,
  forwardGameJoin,
  forwardGameLeave,
} from '../services/gameServerForwardClient';
import {
  isEchoVcActivityKey,
  type EchoVcActivityKey,
} from '../../../activities/cores/vcActivityCatalog';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../../../contracts/types';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Tunneled game room members per voice channel (for room-wide event fan-out). */
const tunneledRoomMembers = new Map<string, Set<string>>();
const socketGameRooms = new Map<string, Set<string>>();

function trackRoomJoin(socketId: string, roomId: string, userId: string): void {
  let members = tunneledRoomMembers.get(roomId);
  if (!members) {
    members = new Set();
    tunneledRoomMembers.set(roomId, members);
  }
  members.add(userId);

  let rooms = socketGameRooms.get(socketId);
  if (!rooms) {
    rooms = new Set();
    socketGameRooms.set(socketId, rooms);
  }
  rooms.add(roomId);
}

function trackRoomLeave(
  socketId: string,
  roomId: string,
  userId: string,
): void {
  const members = tunneledRoomMembers.get(roomId);
  members?.delete(userId);
  if (members && members.size === 0) tunneledRoomMembers.delete(roomId);
  socketGameRooms.get(socketId)?.delete(roomId);
}

export function listTunneledGameRoomMembers(roomId: string): readonly string[] {
  const members = tunneledRoomMembers.get(roomId.trim());
  return members ? [...members] : [];
}

function parseJoin(msg: unknown): GameJoinMsg | null {
  if (!msg || typeof msg !== 'object') return null;
  const roomId =
    typeof (msg as GameJoinMsg).roomId === 'string'
      ? (msg as GameJoinMsg).roomId.trim()
      : '';
  const gameKeyRaw = (msg as GameJoinMsg).gameKey;
  if (
    !roomId ||
    typeof gameKeyRaw !== 'string' ||
    !isEchoVcActivityKey(gameKeyRaw)
  ) {
    return null;
  }
  return { roomId, gameKey: gameKeyRaw as EchoVcActivityKey };
}

function parseLeave(msg: unknown): GameLeaveMsg | null {
  if (!msg || typeof msg !== 'object') return null;
  const roomId =
    typeof (msg as GameLeaveMsg).roomId === 'string'
      ? (msg as GameLeaveMsg).roomId.trim()
      : '';
  return roomId ? { roomId } : null;
}

function parseAction(msg: unknown): GameActionMsg | null {
  if (!msg || typeof msg !== 'object') return null;
  const roomId =
    typeof (msg as GameActionMsg).roomId === 'string'
      ? (msg as GameActionMsg).roomId.trim()
      : '';
  const type =
    typeof (msg as GameActionMsg).type === 'string'
      ? (msg as GameActionMsg).type.trim()
      : '';
  if (!roomId || !type) return null;
  return {
    roomId,
    type,
    payload: (msg as GameActionMsg).payload,
  };
}

async function authorizeVoiceGameRoom(
  userId: string,
  roomId: string,
): Promise<boolean> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return false;
  const ok = await canUserAccessChannel(pool, userId, roomId);
  if (!ok) return false;
  const serverId = await getEchoChannelServerId(pool, roomId);
  if (!serverId) return false;
  const channelType = await getEchoChannelType(pool, serverId, roomId);
  if (channelType !== 'voice') return false;
  const row = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM echo_voice_participants
     WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
     LIMIT 1`,
    [serverId, roomId, userId],
  );
  return (row.rowCount ?? 0) > 0;
}

/**
 * Tunnel authoritative VC game traffic through the main Echo socket (no third
 * browser connection to the game-server).
 */
export function registerGameTunnelHandler(
  socket: IoSocket,
  _io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  if (!options.authenticated || userId.startsWith('user_')) return;

  socket.on(GAME_C2S.join, (msg) => {
    void (async () => {
      const parsed = parseJoin(msg);
      if (!parsed) {
        socket.emit(GAME_S2C.error, { reason: 'rejected' });
        return;
      }
      if (!config.gameServerEnabled) {
        socket.emit(GAME_S2C.error, { reason: 'not_configured' });
        return;
      }
      const allowed = await authorizeVoiceGameRoom(userId, parsed.roomId);
      if (!allowed) {
        log.warn(
          { socketId: socket.id, userId, roomId: parsed.roomId },
          'game:join denied',
        );
        socket.emit(GAME_S2C.error, { reason: 'unauthorized' });
        return;
      }
      const result = await forwardGameJoin({
        roomId: parsed.roomId,
        gameKey: parsed.gameKey,
        userId,
      });
      if (!result) {
        socket.emit(GAME_S2C.error, { reason: 'not_configured' });
        return;
      }
      if (!result.ok) {
        socket.emit(GAME_S2C.error, { reason: result.reason });
        return;
      }
      trackRoomJoin(socket.id, parsed.roomId, userId);
      if (result.snapshot) {
        socket.emit(GAME_S2C.snapshot, result.snapshot);
      }
    })();
  });

  socket.on(GAME_C2S.action, (msg) => {
    void (async () => {
      const parsed = parseAction(msg);
      if (!parsed) {
        socket.emit(GAME_S2C.error, { reason: 'invalid_action' });
        return;
      }
      if (!config.gameServerEnabled) {
        socket.emit(GAME_S2C.error, { reason: 'not_configured' });
        return;
      }
      const allowed = await authorizeVoiceGameRoom(userId, parsed.roomId);
      if (!allowed) {
        socket.emit(GAME_S2C.error, { reason: 'unauthorized' });
        return;
      }
      const result = await forwardGameAction({
        roomId: parsed.roomId,
        userId,
        type: parsed.type,
        payload: parsed.payload,
      });
      if (!result) {
        socket.emit(GAME_S2C.error, { reason: 'not_configured' });
        return;
      }
      if (!result.ok) {
        socket.emit(GAME_S2C.error, { reason: result.reason });
        return;
      }
      if (result.snapshot) {
        socket.emit(GAME_S2C.snapshot, result.snapshot);
      }
    })();
  });

  socket.on(GAME_C2S.leave, (msg) => {
    void (async () => {
      const parsed = parseLeave(msg);
      if (!parsed) return;
      trackRoomLeave(socket.id, parsed.roomId, userId);
      if (!config.gameServerEnabled) return;
      await forwardGameLeave({ roomId: parsed.roomId, userId });
    })();
  });
}

export function cleanupGameTunnelOnDisconnect(
  socketId: string,
  userId: string,
): void {
  const rooms = socketGameRooms.get(socketId);
  if (!rooms?.size) {
    socketGameRooms.delete(socketId);
    return;
  }
  for (const roomId of rooms) {
    trackRoomLeave(socketId, roomId, userId);
    if (config.gameServerEnabled) {
      void forwardGameLeave({ roomId, userId });
    }
  }
  socketGameRooms.delete(socketId);
}
