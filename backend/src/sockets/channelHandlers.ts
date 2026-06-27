import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import { canUserAccessChannel } from '../domain/echoPermissions';
import {
  echoChannelExistsInDb,
  getEchoChannelServerId,
  getEchoStore,
} from '../domain/echoStore';

export type JoinChannelErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

function emitJoinChannelError(
  socket: Socket,
  channelId: string,
  code: JoinChannelErrorCode,
  detail: string,
): void {
  socket.emit('error', { code, channelId, detail });
}

/**
 * After Socket.IO connection state recovery, re-check channel room membership so
 * restored joins cannot bypass permission changes during the disconnect window.
 */
export async function revalidateRecoveredChannelRooms(
  socket: Socket,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): Promise<void> {
  if (!socket.recovered) return;
  if (!options.authenticated || isAnonymousSocketUser(userId)) return;

  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return;

  const rooms = socket.rooms;
  for (const room of rooms) {
    if (room === socket.id) continue;
    if (room.startsWith('echo:')) continue;

    const channelId = room.trim();
    if (!channelId) continue;

    const exists = await echoChannelExistsInDb(pool, channelId);
    if (!exists) {
      void socket.leave(channelId);
      log.info(
        { socketId: socket.id, channelId, userId },
        'Recovered join evicted: unknown Echo channel',
      );
      continue;
    }

    const ok = await canUserAccessChannel(pool, userId, channelId);
    if (!ok) {
      void socket.leave(channelId);
      log.info(
        { socketId: socket.id, channelId, userId },
        'Recovered join evicted: permission denied',
      );
    }
  }
}

export function registerChannelHandlers(
  socket: Socket,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const { authenticated } = options;

  void revalidateRecoveredChannelRooms(socket, log, userId, options);

  socket.on('joinChannel', (channelId) => {
    void (async () => {
      if (typeof channelId !== 'string' || !channelId.trim()) {
        log.warn(
          { socketId: socket.id, channelId },
          'Invalid joinChannel: channelId required',
        );
        return;
      }
      if (!authenticated || isAnonymousSocketUser(userId)) {
        log.warn(
          { socketId: socket.id, channelId },
          'joinChannel denied: Echo channel requires auth',
        );
        emitJoinChannelError(
          socket,
          channelId,
          'UNAUTHENTICATED',
          'Authentication is required to join channels.',
        );
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!pool) {
        log.error(
          { socketId: socket.id, channelId, userId, enabled },
          'joinChannel denied: Echo store pool unavailable',
        );
        emitJoinChannelError(
          socket,
          channelId,
          'UNAVAILABLE',
          'Channel joins are temporarily unavailable.',
        );
        return;
      }
      if (enabled) {
        const exists = await echoChannelExistsInDb(pool, channelId);
        if (!exists) {
          log.warn(
            { socketId: socket.id, channelId, userId },
            'joinChannel denied: unknown Echo channel',
          );
          emitJoinChannelError(
            socket,
            channelId,
            'NOT_FOUND',
            'Channel not found.',
          );
          return;
        }
        const ok = await canUserAccessChannel(pool, userId, channelId);
        if (!ok) {
          log.warn(
            { socketId: socket.id, channelId, userId },
            'joinChannel denied: not a member',
          );
          emitJoinChannelError(
            socket,
            channelId,
            'FORBIDDEN',
            'You do not have access to this channel.',
          );
          return;
        }
      }
      log.info(
        `Socket ${socket.id} (user: ${userId}) joining channel ${channelId}`,
      );
      void socket.join(channelId);
      if (pool) {
        const sid = await getEchoChannelServerId(pool, channelId);
        if (sid) void socket.join(`echo:server:${sid}`);
      }
    })();
  });

  socket.on('leaveChannel', (channelId) => {
    if (typeof channelId !== 'string' || !channelId.trim()) return;
    void socket.leave(channelId);
  });
}
