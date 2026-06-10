/**
 * Short-TTL cache for searchable channel id lists (server-wide search pre-work).
 * Invalidated alongside permission cache mutations.
 */

const TTL_MS = 30_000;
const MAX_ENTRIES = 20_000;

type Entry = { channelIds: string[]; expiresAt: number };

const serverSearchableChannels = new Map<string, Entry>();
const dmThreadChannelIds = new Map<string, Entry>();

function prune(map: Map<string, Entry>, now = Date.now()): void {
  for (const [k, v] of map) {
    if (v.expiresAt <= now) map.delete(k);
  }
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value as string | undefined;
    if (!oldest) break;
    map.delete(oldest);
  }
}

function serverUserKey(serverId: string, userId: string): string {
  return `${serverId}\0${userId}`;
}

export function getCachedSearchableChannelIds(
  serverId: string,
  userId: string,
): string[] | null {
  const hit = serverSearchableChannels.get(serverUserKey(serverId, userId));
  if (hit && hit.expiresAt > Date.now()) return hit.channelIds;
  if (hit) serverSearchableChannels.delete(serverUserKey(serverId, userId));
  return null;
}

export function setCachedSearchableChannelIds(
  serverId: string,
  userId: string,
  channelIds: string[],
): void {
  prune(serverSearchableChannels);
  serverSearchableChannels.set(serverUserKey(serverId, userId), {
    channelIds: [...channelIds],
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getCachedDmThreadChannelIds(userId: string): string[] | null {
  const hit = dmThreadChannelIds.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.channelIds;
  if (hit) dmThreadChannelIds.delete(userId);
  return null;
}

export function setCachedDmThreadChannelIds(
  userId: string,
  channelIds: string[],
): void {
  prune(dmThreadChannelIds);
  dmThreadChannelIds.set(userId, {
    channelIds: [...channelIds],
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateSearchableChannelsForServer(serverId: string): void {
  const prefix = `${serverId}\0`;
  for (const k of [...serverSearchableChannels.keys()]) {
    if (k.startsWith(prefix)) serverSearchableChannels.delete(k);
  }
}

export function invalidateSearchableChannelsForUser(
  serverId: string,
  userId: string,
): void {
  serverSearchableChannels.delete(serverUserKey(serverId, userId));
}

export function invalidateDmThreadChannelIdsForUser(userId: string): void {
  dmThreadChannelIds.delete(userId);
}
