const index = new Map<string, Set<string>>();

export function registerUserSocket(userId: string, socketId: string): void {
  let sids = index.get(userId);
  if (!sids) {
    sids = new Set();
    index.set(userId, sids);
  }
  sids.add(socketId);
}

export function unregisterUserSocket(userId: string, socketId: string): void {
  const sids = index.get(userId);
  if (!sids) return;
  sids.delete(socketId);
  if (sids.size === 0) index.delete(userId);
}

export function getUserSocketIds(userId: string): ReadonlySet<string> {
  return index.get(userId) ?? new Set();
}

export function getAllConnectedUserIds(): ReadonlySet<string> {
  return new Set(index.keys());
}
