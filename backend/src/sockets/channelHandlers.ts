import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import { canUserAccessChannel } from '../domain/echoPermissions';
import {
  echoChannelExistsInDb,
  getEchoChannelServerId,
  getEchoStore,
} from '../domain/echoStore';

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

function emitJoinChannelError(
  socket: Socket,
  channelId: string,
  code: 'UNAUTHENTICATED' | 'UNAVAILABLE',
  detail: string,
): void {
  socket.emit('error', { code, channelId, detail });
}

export function registerChannelHandlers(
  socket: Socket,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const { authenticated } = options;

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
          return;
        }
        const ok = await canUserAccessChannel(pool, userId, channelId);
        if (!ok) {
          log.warn(
            { socketId: socket.id, channelId, userId },
            'joinChannel denied: not a member',
          );
          return;
        }
      }
      log.info(
        `Socket ${socket.id} (user: ${userId}) joining channel ${channelId}`,
      );
      socket.join(channelId);
      if (pool) {
        const sid = await getEchoChannelServerId(pool, channelId);
        if (sid) socket.join(`echo:server:${sid}`);
      }
    })();
  });

  socket.on('leaveChannel', (channelId) => {
    if (typeof channelId !== 'string' || !channelId.trim()) return;
    socket.leave(channelId);
  });
}
