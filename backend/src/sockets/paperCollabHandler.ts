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
export const channelCursors = new Map<string, Map<string, CursorEntry>>();
/** Ephemeral active editing blocks per channel */
const channelDirtyBlocks = new Map<string, Map<string, DirtyEntry>>();
/** Ephemeral block preview texts per channel */
const channelBlockPreviews = new Map<string, Map<string, PreviewEntry>>();
const LOCK_IDLE_MS = 45_000;
const CURSOR_STALE_MS = 8_000;
/** Ephemeral dirty entries go stale after this ms of inactivity */
const DIRTY_STALE_MS = 3_000;
/** Ephemeral previews go stale after this ms */
const PREVIEW_STALE_MS = 5_000;
/** Max length of preview text to broadcast */
const MAX_PREVIEW_CHARS = 200;

type DirtyEntry = {
  userId: string;
  blockId: string;
  displayName: string;
  color: string;
  updatedAt: number;
};

type PreviewEntry = {
  userId: string;
  blockId: string;
  displayName: string;
  color: string;
  previewText: string;
  updatedAt: number;
};
/**
 * Cursor moves arrive at the client's raw pointer cadence (potentially dozens/sec
 * per author) and each broadcast carries the full channel cursor snapshot — O(N²)
 * traffic with N co-editors, amplified across replicas on the NATS adapter. Coalesce
 * per channel so at most one snapshot is emitted per flush window.
 */
export const CURSOR_FLUSH_MS = 50;
const pendingCursorFlush = new Map<string, ReturnType<typeof setTimeout>>();

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

export function cancelPendingCursorFlush(channelId: string): void {
  const t = pendingCursorFlush.get(channelId);
  if (t) {
    clearTimeout(t);
    pendingCursorFlush.delete(channelId);
  }
}

export function emitCursorsNow(io: Server, channelId: string): void {
  cancelPendingCursorFlush(channelId);
  const payload: PaperCursorsPayload = {
    channelId,
    cursors: serializeCursors(channelId),
  };
  io.to(paperWatchRoom(channelId)).emit('paper:cursors', payload);
}

function dirtyForChannel(channelId: string): Map<string, DirtyEntry> {
  let map = channelDirtyBlocks.get(channelId);
  if (!map) {
    map = new Map();
    channelDirtyBlocks.set(channelId, map);
  }
  return map;
}

function previewsForChannel(channelId: string): Map<string, PreviewEntry> {
  let map = channelBlockPreviews.get(channelId);
  if (!map) {
    map = new Map();
    channelBlockPreviews.set(channelId, map);
  }
  return map;
}

function serializeDirty(
  channelId: string,
): { userId: string; blockId: string; displayName: string; color: string }[] {
  const now = Date.now();
  const map = dirtyForChannel(channelId);
  const out: {
    userId: string;
    blockId: string;
    displayName: string;
    color: string;
  }[] = [];
  for (const [key, entry] of map) {
    if (now - entry.updatedAt > DIRTY_STALE_MS) {
      map.delete(key);
      continue;
    }
    out.push({
      userId: entry.userId,
      blockId: entry.blockId,
      displayName: entry.displayName,
      color: entry.color,
    });
  }
  return out;
}

function serializePreviews(channelId: string): {
  userId: string;
  blockId: string;
  displayName: string;
  color: string;
  previewText: string;
}[] {
  const now = Date.now();
  const map = previewsForChannel(channelId);
  const out: {
    userId: string;
    blockId: string;
    displayName: string;
    color: string;
    previewText: string;
  }[] = [];
  for (const [key, entry] of map) {
    if (now - entry.updatedAt > PREVIEW_STALE_MS) {
      map.delete(key);
      continue;
    }
    out.push({
      userId: entry.userId,
      blockId: entry.blockId,
      displayName: entry.displayName,
      color: entry.color,
      previewText: entry.previewText,
    });
  }
  return out;
}

/** Coalesce dirty broadcasts (lighter weight than cursors) */
const DIRTY_FLUSH_MS = 100;
const pendingDirtyFlush = new Map<string, ReturnType<typeof setTimeout>>();

function emitDirtyNow(io: Server, channelId: string): void {
  const t = pendingDirtyFlush.get(channelId);
  if (t) {
    clearTimeout(t);
    pendingDirtyFlush.delete(channelId);
  }
  const payload = {
    channelId,
    dirty: serializeDirty(channelId),
  };
  io.to(paperWatchRoom(channelId)).emit('paper:block-dirty', payload);
}

export function broadcastDirty(io: Server, channelId: string): void {
  if (pendingDirtyFlush.has(channelId)) return;
  const t = setTimeout(() => {
    pendingDirtyFlush.delete(channelId);
    emitDirtyNow(io, channelId);
  }, DIRTY_FLUSH_MS);
  if (typeof t.unref === 'function') t.unref();
  pendingDirtyFlush.set(channelId, t);
}

/** Coalesce preview broadcasts (heavier payload) */
const PREVIEW_FLUSH_MS = 200;
const pendingPreviewFlush = new Map<string, ReturnType<typeof setTimeout>>();

function emitPreviewsNow(io: Server, channelId: string): void {
  const t = pendingPreviewFlush.get(channelId);
  if (t) {
    clearTimeout(t);
    pendingPreviewFlush.delete(channelId);
  }
  const payload = {
    channelId,
    previews: serializePreviews(channelId),
  };
  io.to(paperWatchRoom(channelId)).emit('paper:block-previews', payload);
}

export function broadcastPreviews(io: Server, channelId: string): void {
  if (pendingPreviewFlush.has(channelId)) return;
  const t = setTimeout(() => {
    pendingPreviewFlush.delete(channelId);
    emitPreviewsNow(io, channelId);
  }, PREVIEW_FLUSH_MS);
  if (typeof t.unref === 'function') t.unref();
  pendingPreviewFlush.set(channelId, t);
}

/**
 * Coalesces cursor snapshots per channel: the first request schedules a flush and
 * subsequent moves within the window collapse into it. Use {@link emitCursorsNow}
 * when immediacy matters (e.g. tearing down a channel).
 */
export function broadcastCursors(io: Server, channelId: string): void {
  if (pendingCursorFlush.has(channelId)) return;
  const t = setTimeout(() => {
    pendingCursorFlush.delete(channelId);
    emitCursorsNow(io, channelId);
  }, CURSOR_FLUSH_MS);
  if (typeof t.unref === 'function') t.unref();
  pendingCursorFlush.set(channelId, t);
}

/** Clear locks/cursors when fewer than two authors remain. */
export function clearPaperCollabForChannel(
  io: Server,
  channelId: string,
): void {
  channelLocks.delete(channelId);
  channelCursors.delete(channelId);
  cancelPendingCursorFlush(channelId);
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

  socket.on('paper:block-dirty', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (!channelId || !blockId) return;
      if (!(await collabAllowed(channelId))) return;

      const displayName =
        typeof payload?.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName.trim()
          : 'Author';
      const color =
        typeof payload?.color === 'string' && payload.color.trim()
          ? payload.color.trim()
          : '#6366f1';

      const map = dirtyForChannel(channelId);
      const key = `${userId}:${blockId}`;
      map.set(key, {
        userId,
        blockId,
        displayName,
        color,
        updatedAt: Date.now(),
      });
      broadcastDirty(io, channelId);
    })();
  });

  socket.on('paper:block-preview', (payload) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const blockId =
        typeof payload?.blockId === 'string' ? payload.blockId.trim() : '';
      if (!channelId || !blockId) return;
      if (!(await collabAllowed(channelId))) return;

      const previewText =
        typeof payload?.previewText === 'string'
          ? payload.previewText.slice(0, MAX_PREVIEW_CHARS)
          : '';
      if (!previewText) return;

      const displayName =
        typeof payload?.displayName === 'string' && payload.displayName.trim()
          ? payload.displayName.trim()
          : 'Author';
      const color =
        typeof payload?.color === 'string' && payload.color.trim()
          ? payload.color.trim()
          : '#6366f1';

      const map = previewsForChannel(channelId);
      const key = `${userId}:${blockId}`;
      map.set(key, {
        userId,
        blockId,
        displayName,
        color,
        previewText,
        updatedAt: Date.now(),
      });
      broadcastPreviews(io, channelId);
    })();
  });

  socket.on('disconnect', () => {
    // paperWatchHandler clears socket channels; collab cleanup runs from there too.
    // Clean up ephemeral state for this user
    for (const [channelId, map] of channelDirtyBlocks) {
      let changed = false;
      for (const [key, entry] of map) {
        if (entry.userId === userId) {
          map.delete(key);
          changed = true;
        }
      }
      if (changed) broadcastDirty(io, channelId);
    }
    for (const [channelId, map] of channelBlockPreviews) {
      let changed = false;
      for (const [key, entry] of map) {
        if (entry.userId === userId) {
          map.delete(key);
          changed = true;
        }
      }
      if (changed) broadcastPreviews(io, channelId);
    }
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

const LOCK_PRUNE_INTERVAL_MS = 15_000;

/** Prune abandoned block locks on a fixed interval (server process lifetime). */
export function startPaperCollabLockPruner(io: Server): void {
  const t = setInterval(() => {
    pruneStalePaperLocks(io);
  }, LOCK_PRUNE_INTERVAL_MS);
  if (typeof t.unref === 'function') t.unref();
}

export function paperCollabAuthorCount(channelId: string): number {
  return countPaperAuthors(channelId);
}
