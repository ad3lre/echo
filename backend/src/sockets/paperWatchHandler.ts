import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { canUserAccessChannel } from '../domain/echoPermissions';
import {
  echoChannelExistsInDb,
  getEchoChannelServerId,
  getEchoStore,
  getEchoUserTypingProfile,
} from '../domain/echoStore';
import { getEchoChannelType } from '../domain/echoStore/voice';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../../shared/types';
import {
  broadcastPaperWatchers,
  channelWatchers,
  MAX_PAPER_WATCHERS_PER_CHANNEL,
  paperWatchRoom,
  socketPaperChannels,
} from './paperWatchState';
import {
  cleanupPaperCollabForUser,
  clearPaperCollabForChannel,
} from './paperCollabHandler';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

const WATCH_JOIN_MIN_INTERVAL_MS = 800;
const joinRate = new Map<string, number>();

function watchRateKey(userId: string, channelId: string): string {
  return `${userId}\0${channelId}`;
}

function removeSocketFromChannel(
  io: Server,
  socketId: string,
  channelId: string,
  userId: string,
) {
  const map = channelWatchers.get(channelId);
  if (!map) return;
  const entry = map.get(userId);
  if (!entry) return;
  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    map.delete(userId);
    cleanupPaperCollabForUser(io, userId, [channelId]);
  }
  if (map.size === 0) {
    channelWatchers.delete(channelId);
  }
  broadcastPaperWatchers(io, channelId, clearPaperCollabForChannel);
}

function cleanupSocket(io: Server, socketId: string, userId: string) {
  const channels = socketPaperChannels.get(socketId);
  if (!channels) return;
  for (const channelId of channels) {
    const map = channelWatchers.get(channelId);
    if (!map) continue;
    for (const [uid, entry] of map) {
      if (entry.socketIds.delete(socketId) && entry.socketIds.size === 0) {
        map.delete(uid);
      }
    }
    if (map.size === 0) {
      channelWatchers.delete(channelId);
    } else {
      broadcastPaperWatchers(io, channelId, clearPaperCollabForChannel);
    }
  }
  cleanupPaperCollabForUser(io, userId, channels);
  socketPaperChannels.delete(socketId);
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

/**
 * Tracks users viewing a paper channel and broadcasts watcher lists to
 * `paper-watch:{channelId}` rooms. Authoring users enable block-lock collab
 * when two or more are connected.
 */
export function registerPaperWatchHandler(
  socket: IoSocket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const { authenticated } = options;

  async function addWatch(
    channelId: string,
    authoring: boolean,
  ): Promise<boolean> {
    if (!authenticated || isAnonymousSocketUser(userId)) {
      log.warn(
        { socketId: socket.id, channelId },
        'paper:watch denied: auth required',
      );
      return false;
    }

    const now = Date.now();
    const rk = watchRateKey(userId, channelId);
    const last = joinRate.get(rk) ?? 0;
    if (now - last < WATCH_JOIN_MIN_INTERVAL_MS) return false;
    joinRate.set(rk, now);

    const { enabled, pool } = await getEchoStore();
    if (!enabled || !pool) return false;

    const exists = await echoChannelExistsInDb(pool, channelId);
    if (!exists) return false;

    const serverId = await getEchoChannelServerId(pool, channelId);
    if (!serverId) return false;

    const chType = await getEchoChannelType(pool, serverId, channelId);
    if (chType !== 'paper') {
      log.warn(
        { socketId: socket.id, channelId },
        'paper:watch denied: not a paper channel',
      );
      return false;
    }

    const ok = await canUserAccessChannel(pool, userId, channelId);
    if (!ok) {
      log.warn(
        { socketId: socket.id, channelId, userId },
        'paper:watch denied: no channel access',
      );
      return false;
    }

    let map = channelWatchers.get(channelId);
    if (!map) {
      map = new Map();
      channelWatchers.set(channelId, map);
    }
    if (!map.has(userId) && map.size >= MAX_PAPER_WATCHERS_PER_CHANNEL) {
      log.warn({ channelId }, 'paper:watch denied: watcher cap reached');
      return false;
    }

    let displayName = 'Someone';
    let avatarUrl: string | undefined;
    try {
      const prof = await getEchoUserTypingProfile(pool, userId);
      displayName = prof.displayName;
      avatarUrl = prof.avatarUrl || undefined;
    } catch (e) {
      log.warn(
        { err: e instanceof Error ? e.message : String(e), userId },
        'paper:watch profile lookup failed',
      );
    }

    let entry = map.get(userId);
    if (!entry) {
      entry = {
        userId,
        displayName,
        avatarUrl,
        authoring,
        socketIds: new Set(),
      };
      map.set(userId, entry);
    } else {
      entry.displayName = displayName;
      entry.avatarUrl = avatarUrl;
      entry.authoring = authoring;
    }
    entry.socketIds.add(socket.id);

    let chans = socketPaperChannels.get(socket.id);
    if (!chans) {
      chans = new Set();
      socketPaperChannels.set(socket.id, chans);
    }
    chans.add(channelId);

    await socket.join(paperWatchRoom(channelId));
    broadcastPaperWatchers(io, channelId, clearPaperCollabForChannel);
    return true;
  }

  function setAuthoring(channelId: string, authoring: boolean) {
    const map = channelWatchers.get(channelId);
    const entry = map?.get(userId);
    if (!entry) return;
    if (entry.authoring === authoring) return;
    entry.authoring = authoring;
    broadcastPaperWatchers(io, channelId, clearPaperCollabForChannel);
    if (!authoring) {
      cleanupPaperCollabForUser(io, userId, [channelId]);
    }
  }

  socket.on('paper:watch', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      if (!channelId) return;
      const authoring = payload?.authoring === true;
      await addWatch(channelId, authoring);
    })();
  });

  socket.on('paper:authoring', (payload) => {
    const channelId =
      typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
    if (!channelId) return;
    setAuthoring(channelId, payload?.authoring === true);
  });

  socket.on('paper:unwatch', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      if (!channelId) return;
      await socket.leave(paperWatchRoom(channelId));
      removeSocketFromChannel(io, socket.id, channelId, userId);
      socketPaperChannels.get(socket.id)?.delete(channelId);
      cleanupPaperCollabForUser(io, userId, [channelId]);
    })();
  });

  socket.on('disconnect', () => {
    cleanupSocket(io, socket.id, userId);
  });
}

/** @internal test hook */
export function _paperWatchTestReset(): void {
  channelWatchers.clear();
  socketPaperChannels.clear();
  joinRate.clear();
}
