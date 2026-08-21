import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { canUserAccessChannel } from '../domain/permissions/echoPermissions';
import {
  echoChannelExistsInDb,
  getEchoChannelServerId,
  getEchoStore,
  getUserCommunicationTimeoutState,
  getEchoUserTypingProfile,
} from '../domain/echoStore';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../../../contracts/types';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

const TYPING_MIN_INTERVAL_MS = 450;
const typingLastForward = new Map<string, number>();

function typingRateKey(userId: string, channelId: string): string {
  return `${userId}\0${channelId}`;
}

function pruneTypingRateMap(now: number) {
  if (typingLastForward.size < 50_000) return;
  for (const [k, t] of typingLastForward) {
    if (now - t > 120_000) typingLastForward.delete(k);
  }
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

/**
 * Forwards lightweight typing pulses to channel peers (excluding sender).
 * Rate-limited per user per channel to keep traffic negligible at scale.
 */
export function registerTypingHandler(
  socket: IoSocket,
  _io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const { authenticated } = options;

  socket.on('channel:typing', (payload) => {
    void (async () => {
      if (!payload || typeof payload !== 'object') return;
      const channelId =
        typeof (payload as { channelId?: unknown }).channelId === 'string'
          ? String((payload as { channelId: string }).channelId).trim()
          : '';
      if (!channelId) return;

      const { enabled, pool } = await getEchoStore();
      if (enabled && pool) {
        const exists = await echoChannelExistsInDb(pool, channelId);
        if (exists) {
          if (!authenticated || isAnonymousSocketUser(userId)) {
            log.warn(
              { socketId: socket.id, channelId },
              'channel:typing denied: Echo channel requires auth',
            );
            return;
          }
          const ok = await canUserAccessChannel(pool, userId, channelId);
          if (!ok) {
            log.warn(
              { socketId: socket.id, channelId, userId },
              'channel:typing denied: not a member',
            );
            return;
          }
          const serverId = await getEchoChannelServerId(pool, channelId);
          if (serverId) {
            const timeoutState = await getUserCommunicationTimeoutState(
              pool,
              serverId,
              userId,
            );
            if (timeoutState.active) {
              log.warn(
                { socketId: socket.id, channelId, userId, serverId },
                'channel:typing denied: communication timeout active',
              );
              return;
            }
          }
        }
      }

      const now = Date.now();
      pruneTypingRateMap(now);
      const rk = typingRateKey(userId, channelId);
      const last = typingLastForward.get(rk) ?? 0;
      if (now - last < TYPING_MIN_INTERVAL_MS) return;
      typingLastForward.set(rk, now);

      let displayName = 'Someone';
      let avatarUrl = '';
      if (pool && authenticated && !isAnonymousSocketUser(userId)) {
        try {
          const prof = await getEchoUserTypingProfile(pool, userId);
          displayName = prof.displayName;
          avatarUrl = prof.avatarUrl;
        } catch (e) {
          log.warn(
            { err: e instanceof Error ? e.message : String(e), userId },
            'channel:typing profile lookup failed',
          );
        }
      }

      socket.to(channelId).emit('channel:typing', {
        channelId,
        userId,
        displayName,
        avatarUrl,
      });
    })();
  });
}
