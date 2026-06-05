import type { Socket } from 'socket.io-client';
import type {
  PaperBlockDirtyPayload,
  PaperBlockPreviewsPayload,
  PaperCursorsPayload,
  PaperLockRequestedPayload,
  PaperLocksPayload,
  PaperWatchersPayload,
} from '@shared/types/paperCollab';

type PaperWatchersListener = (payload: PaperWatchersPayload) => void;
type PaperLocksListener = (payload: PaperLocksPayload) => void;
type PaperCursorsListener = (payload: PaperCursorsPayload) => void;
type PaperLockRequestedListener = (payload: PaperLockRequestedPayload) => void;
type PaperBlockDirtyListener = (payload: PaperBlockDirtyPayload) => void;
type PaperBlockPreviewsListener = (payload: PaperBlockPreviewsPayload) => void;

let boundSocket: Socket | null = null;
const watcherListeners = new Set<PaperWatchersListener>();
const lockListeners = new Set<PaperLocksListener>();
const cursorListeners = new Set<PaperCursorsListener>();
const lockRequestedListeners = new Set<PaperLockRequestedListener>();
const dirtyListeners = new Set<PaperBlockDirtyListener>();
const previewsListeners = new Set<PaperBlockPreviewsListener>();

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

function onPaperBlockDirty(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperBlockDirtyPayload;
  if (typeof p.channelId !== 'string' || !Array.isArray(p.dirty)) return;
  for (const fn of dirtyListeners) fn(p);
}

function onPaperBlockPreviews(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const p = raw as PaperBlockPreviewsPayload;
  if (typeof p.channelId !== 'string' || !Array.isArray(p.previews)) return;
  for (const fn of previewsListeners) fn(p);
}

export function bindPaperWatchSocket(socket: Socket | null): void {
  if (boundSocket) {
    boundSocket.off('paper:watchers', onPaperWatchers);
    boundSocket.off('paper:locks', onPaperLocks);
    boundSocket.off('paper:cursors', onPaperCursors);
    boundSocket.off('paper:lock-requested', onPaperLockRequested);
    boundSocket.off('paper:block-dirty', onPaperBlockDirty);
    boundSocket.off('paper:block-previews', onPaperBlockPreviews);
  }
  boundSocket = socket;
  if (socket) {
    socket.on('paper:watchers', onPaperWatchers);
    socket.on('paper:locks', onPaperLocks);
    socket.on('paper:cursors', onPaperCursors);
    socket.on('paper:lock-requested', onPaperLockRequested);
    socket.on('paper:block-dirty', onPaperBlockDirty);
    socket.on('paper:block-previews', onPaperBlockPreviews);
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

export function subscribePaperBlockDirty(
  fn: PaperBlockDirtyListener,
): () => void {
  dirtyListeners.add(fn);
  return () => dirtyListeners.delete(fn);
}

export function subscribePaperBlockPreviews(
  fn: PaperBlockPreviewsListener,
): () => void {
  previewsListeners.add(fn);
  return () => previewsListeners.delete(fn);
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

export function emitPaperBlockDirty(
  channelId: string,
  blockId: string,
  displayName: string,
  color: string,
): void {
  const id = channelId.trim();
  const block = blockId.trim();
  if (!id || !block || !boundSocket?.connected) return;
  boundSocket.emit('paper:block-dirty', {
    channelId: id,
    blockId: block,
    displayName,
    color,
  });
}

export function emitPaperBlockPreview(
  channelId: string,
  blockId: string,
  previewText: string,
  displayName: string,
  color: string,
): void {
  const id = channelId.trim();
  const block = blockId.trim();
  if (!id || !block || !boundSocket?.connected) return;
  boundSocket.emit('paper:block-preview', {
    channelId: id,
    blockId: block,
    previewText,
    displayName,
    color,
  });
}
