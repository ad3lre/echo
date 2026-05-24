import type { Socket } from 'socket.io-client';
import type {
  PaperCursorsPayload,
  PaperLockRequestedPayload,
  PaperLocksPayload,
  PaperWatchersPayload,
} from '@shared/types/paperCollab';

type PaperWatchersListener = (payload: PaperWatchersPayload) => void;
type PaperLocksListener = (payload: PaperLocksPayload) => void;
type PaperCursorsListener = (payload: PaperCursorsPayload) => void;
type PaperLockRequestedListener = (payload: PaperLockRequestedPayload) => void;

let boundSocket: Socket | null = null;
const watcherListeners = new Set<PaperWatchersListener>();
const lockListeners = new Set<PaperLocksListener>();
const cursorListeners = new Set<PaperCursorsListener>();
const lockRequestedListeners = new Set<PaperLockRequestedListener>();

function onPaperWatchers(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperWatchersPayload;
  if (typeof p.channelId !== 'string' || !Array.isArray(p.watchers)) return;
  for (const fn of watcherListeners) fn(p);
}

function onPaperLocks(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperLocksPayload;
  if (typeof p.channelId !== 'string' || !Array.isArray(p.locks)) return;
  for (const fn of lockListeners) fn(p);
}

function onPaperCursors(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperCursorsPayload;
  if (typeof p.channelId !== 'string' || !Array.isArray(p.cursors)) return;
  for (const fn of cursorListeners) fn(p);
}

function onPaperLockRequested(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperLockRequestedPayload;
  if (typeof p.channelId !== 'string' || typeof p.blockId !== 'string') return;
  for (const fn of lockRequestedListeners) fn(p);
}

export function bindPaperWatchSocket(socket: Socket | null): void {
  if (boundSocket) {
    boundSocket.off('paper:watchers', onPaperWatchers);
    boundSocket.off('paper:locks', onPaperLocks);
    boundSocket.off('paper:cursors', onPaperCursors);
    boundSocket.off('paper:lock-requested', onPaperLockRequested);
  }
  boundSocket = socket;
  if (socket) {
    socket.on('paper:watchers', onPaperWatchers);
    socket.on('paper:locks', onPaperLocks);
    socket.on('paper:cursors', onPaperCursors);
    socket.on('paper:lock-requested', onPaperLockRequested);
  }
}

export function subscribePaperWatchers(fn: PaperWatchersListener): () => void {
  watcherListeners.add(fn);
  return () => watcherListeners.delete(fn);
}

export function subscribePaperLocks(fn: PaperLocksListener): () => void {
  lockListeners.add(fn);
  return () => lockListeners.delete(fn);
}

export function subscribePaperCursors(fn: PaperCursorsListener): () => void {
  cursorListeners.add(fn);
  return () => cursorListeners.delete(fn);
}

export function subscribePaperLockRequested(
  fn: PaperLockRequestedListener,
): () => void {
  lockRequestedListeners.add(fn);
  return () => lockRequestedListeners.delete(fn);
}

export type { PaperWatchersPayload };

export function emitPaperWatch(channelId: string, authoring = false): void {
  const id = channelId.trim();
  if (!id || !boundSocket?.connected) return;
  boundSocket.emit('paper:watch', { channelId: id, authoring });
}

export function emitPaperAuthoring(
  channelId: string,
  authoring: boolean,
): void {
  const id = channelId.trim();
  if (!id || !boundSocket?.connected) return;
  boundSocket.emit('paper:authoring', { channelId: id, authoring });
}

export function emitPaperUnwatch(channelId: string): void {
  const id = channelId.trim();
  if (!id || !boundSocket?.connected) return;
  boundSocket.emit('paper:unwatch', { channelId: id });
}

export function emitPaperClaim(
  channelId: string,
  blockId: string,
  displayName: string,
): void {
  const id = channelId.trim();
  const block = blockId.trim();
  if (!id || !block || !boundSocket?.connected) return;
  boundSocket.emit('paper:claim', {
    channelId: id,
    blockId: block,
    displayName,
  });
}

export function emitPaperRelease(channelId: string, blockId?: string): void {
  const id = channelId.trim();
  if (!id || !boundSocket?.connected) return;
  boundSocket.emit('paper:release', {
    channelId: id,
    ...(blockId?.trim() ? { blockId: blockId.trim() } : {}),
  });
}

export function emitPaperCursor(
  channelId: string,
  payload: {
    blockId: string;
    anchor: number;
    head: number;
    displayName: string;
    color: string;
  },
): void {
  const id = channelId.trim();
  if (!id || !boundSocket?.connected) return;
  boundSocket.emit('paper:cursor', { channelId: id, ...payload });
}

export function emitPaperLockRequest(
  channelId: string,
  blockId: string,
  displayName: string,
): void {
  const id = channelId.trim();
  const block = blockId.trim();
  if (!id || !block || !boundSocket?.connected) return;
  boundSocket.emit('paper:lock-request', {
    channelId: id,
    blockId: block,
    displayName,
  });
}
