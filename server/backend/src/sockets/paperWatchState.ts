import type { Server } from 'socket.io';
import type { PaperWatchersPayload } from '../../../../contracts/types/paperCollab';

export const MAX_PAPER_WATCHERS_PER_CHANNEL = 50;

export type PaperWatcherEntry = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  authoring: boolean;
  socketIds: Set<string>;
};

export const channelWatchers = new Map<
  string,
  Map<string, PaperWatcherEntry>
>();
export const socketPaperChannels = new Map<string, Set<string>>();

export function paperWatchRoom(channelId: string): string {
  return `paper-watch:${channelId}`;
}

export function countPaperAuthors(channelId: string): number {
  const map = channelWatchers.get(channelId);
  if (!map) return 0;
  let n = 0;
  for (const entry of map.values()) {
    if (entry.authoring) n += 1;
  }
  return n;
}

export function isPaperCollabEnabled(channelId: string): boolean {
  return countPaperAuthors(channelId) >= 2;
}

export function listPaperWatchers(
  channelId: string,
): PaperWatchersPayload['watchers'] {
  const map = channelWatchers.get(channelId);
  if (!map) return [];
  return [...map.values()].map((w) => ({
    userId: w.userId,
    displayName: w.displayName,
    avatarUrl: w.avatarUrl,
    authoring: w.authoring,
  }));
}

export function broadcastPaperWatchers(
  io: Server,
  channelId: string,
  onCollabDisabled?: (io: Server, channelId: string) => void,
): void {
  const authorCount = countPaperAuthors(channelId);
  const collabEnabled = authorCount >= 2;
  const payload: PaperWatchersPayload = {
    channelId,
    watchers: listPaperWatchers(channelId),
    authorCount,
    collabEnabled,
  };
  io.to(paperWatchRoom(channelId)).emit('paper:watchers', payload);
  if (!collabEnabled) {
    onCollabDisabled?.(io, channelId);
  }
}

export function emitPaperEventToUser(
  io: Server,
  channelId: string,
  userId: string,
  event: 'paper:lock-requested',
  payload: unknown,
): void {
  const map = channelWatchers.get(channelId);
  const entry = map?.get(userId);
  if (!entry) return;
  for (const socketId of entry.socketIds) {
    io.to(socketId).emit(event, payload);
  }
}
