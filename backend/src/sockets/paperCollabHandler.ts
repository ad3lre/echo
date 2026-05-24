import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { getPaperCapabilitiesForUser } from '../domain/echoStore/access';
import { getEchoStore } from '../domain/echoStore';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../../shared/types';
import type {
  PaperBlockLock,
  PaperCursorsPayload,
  PaperLocksPayload,
  PaperRemoteCursor,
} from '../../../shared/types/paperCollab';
import {
  countPaperAuthors,
  emitPaperEventToUser,
  isPaperCollabEnabled,
  paperWatchRoom,
} from './paperWatchState';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

type LockEntry = PaperBlockLock & { since: number };
type CursorEntry = PaperRemoteCursor & { updatedAt: number };

const channelLocks = new Map<string, Map<string, LockEntry>>();
const channelCursors = new Map<string, Map<string, CursorEntry>>();
const LOCK_IDLE_MS = 45_000;
const CURSOR_STALE_MS = 8_000;

function locksForChannel(channelId: string): Map<string, LockEntry> {
  let map = channelLocks.get(channelId);
  if (!map) {
    map = new Map();
    channelLocks.set(channelId, map);
  }
  return map;
}

function cursorsForChannel(channelId: string): Map<string, CursorEntry> {
  let map = channelCursors.get(channelId);
  if (!map) {
    map = new Map();
    channelCursors.set(channelId, map);
  }
  return map;
}

function serializeLocks(channelId: string): PaperBlockLock[] {
  return [...locksForChannel(channelId).values()].map(
    ({ blockId, userId, displayName }) => ({
      blockId,
      userId,
      displayName,
    }),
  );
}

function serializeCursors(channelId: string): PaperRemoteCursor[] {
  const now = Date.now();
  const map = cursorsForChannel(channelId);
  const out: PaperRemoteCursor[] = [];
  for (const [userId, c] of map) {
    if (now - c.updatedAt > CURSOR_STALE_MS) {
      map.delete(userId);
      continue;
    }
    out.push({
      userId,
      displayName: c.displayName,
      color: c.color,
      blockId: c.blockId,
      anchor: c.anchor,
      head: c.head,
    });
  }
  return out;
}

function broadcastLocks(io: Server, channelId: string): void {
  const payload: PaperLocksPayload = {
    channelId,
    locks: serializeLocks(channelId),
  };
  io.to(paperWatchRoom(channelId)).emit('paper:locks', payload);
}

function broadcastCursors(io: Server, channelId: string): void {
  const payload: PaperCursorsPayload = {
    channelId,
    cursors: serializeCursors(channelId),
  };
  io.to(paperWatchRoom(channelId)).emit('paper:cursors', payload);
}

/** Clear locks/cursors when fewer than two authors remain. */
export function clearPaperCollabForChannel(
  io: Server,
  channelId: string,
): void {
  channelLocks.delete(channelId);
  channelCursors.delete(channelId);
  io.to(paperWatchRoom(channelId)).emit('paper:locks', {
    channelId,
    locks: [],
  } satisfies PaperLocksPayload);
  io.to(paperWatchRoom(channelId)).emit('paper:cursors', {
    channelId,
    cursors: [],
  } satisfies PaperCursorsPayload);
}

function releaseLocksForUser(
  io: Server,
  channelId: string,
  userId: string,
): void {
  const map = channelLocks.get(channelId);
  if (!map) return;
  let changed = false;
  for (const [blockId, lock] of map) {
    if (lock.userId === userId) {
      map.delete(blockId);
      changed = true;
    }
  }
  if (map.size === 0) channelLocks.delete(channelId);
  if (changed) broadcastLocks(io, channelId);
}

function clearCursorForUser(
  io: Server,
  channelId: string,
  userId: string,
): void {
  const map = channelCursors.get(channelId);
  if (!map?.delete(userId)) return;
  if (map.size === 0) channelCursors.delete(channelId);
  broadcastCursors(io, channelId);
}

export function cleanupPaperCollabForUser(
  io: Server,
  userId: string,
  channelIds: Iterable<string>,
): void {
  for (const channelId of channelIds) {
    releaseLocksForUser(io, channelId, userId);
    clearCursorForUser(io, channelId, userId);
  }
}

async function assertAuthor(
  channelId: string,
  userId: string,
): Promise<boolean> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return false;
  const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
  return caps.canAuthorPaper;
}

/**
 * Block-ownership locks and remote cursors over the main paper watch socket room.
 * Inactive when fewer than two authors are connected (`collabEnabled` on watchers).
 */
export function registerPaperCollabHandler(
  socket: IoSocket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const { authenticated } = options;

  async function collabAllowed(channelId: string): Promise<boolean> {
    if (!authenticated || userId.startsWith('user_')) return false;
    if (!isPaperCollabEnabled(channelId)) return false;
    return assertAuthor(channelId, userId);
  }

  socket.on('paper:claim', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (!channelId || !blockId) return;
      if (!(await collabAllowed(channelId))) return;

      const map = locksForChannel(channelId);
      const existing = map.get(blockId);
      if (existing && existing.userId !== userId) return;

      const displayName =
        typeof payload?.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName.trim()
          : 'Author';
      map.set(blockId, {
        blockId,
        userId,
        displayName,
        since: Date.now(),
      });
      broadcastLocks(io, channelId);
    })();
  });

  socket.on('paper:release', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      if (!channelId) return;
      if (!(await collabAllowed(channelId))) return;

      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (blockId) {
        const map = locksForChannel(channelId);
        const lock = map.get(blockId);
        if (lock?.userId === userId) {
          map.delete(blockId);
          if (map.size === 0) channelLocks.delete(channelId);
          broadcastLocks(io, channelId);
        }
        return;
      }
      releaseLocksForUser(io, channelId, userId);
    })();
  });

  socket.on('paper:cursor', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (!channelId || !blockId) return;
      if (!(await collabAllowed(channelId))) return;

      const anchor = Number(payload?.anchor);
      const head = Number(payload?.head);
      if (!Number.isFinite(anchor) || !Number.isFinite(head)) return;

      const displayName =
        typeof payload?.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName.trim()
          : 'Author';
      const color =
        typeof payload?.color === 'string' && payload.color.trim()
          ? payload.color.trim()
          : '#6366f1';

      cursorsForChannel(channelId).set(userId, {
        userId,
        displayName,
        color,
        blockId,
        anchor,
        head,
        updatedAt: Date.now(),
      });
      broadcastCursors(io, channelId);
    })();
  });

  socket.on('paper:lock-request', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (!channelId || !blockId) return;
      if (!(await collabAllowed(channelId))) return;

      const lock = locksForChannel(channelId).get(blockId);
      if (!lock || lock.userId === userId) return;

      const fromDisplayName =
        typeof payload?.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName.trim()
          : 'Someone';

      emitPaperEventToUser(io, channelId, lock.userId, 'paper:lock-requested', {
        channelId,
        blockId,
        fromUserId: userId,
        fromDisplayName,
        toUserId: lock.userId,
      });
    })();
  });

  socket.on('disconnect', () => {
    // paperWatchHandler clears socket channels; collab cleanup runs from there too.
  });
}

/** Release stale locks (no cursor refresh) — called periodically if needed. */
export function pruneStalePaperLocks(io: Server): void {
  const now = Date.now();
  for (const [channelId, map] of channelLocks) {
    if (!isPaperCollabEnabled(channelId)) {
      channelLocks.delete(channelId);
      continue;
    }
    let changed = false;
    for (const [blockId, lock] of map) {
      if (now - lock.since > LOCK_IDLE_MS) {
        map.delete(blockId);
        changed = true;
      }
    }
    if (map.size === 0) channelLocks.delete(channelId);
    if (changed) broadcastLocks(io, channelId);
  }
}

export function paperCollabAuthorCount(channelId: string): number {
  return countPaperAuthors(channelId);
}
