/**
 * Per-process count of authenticated Echo sockets per user. Used so closing one tab
 * does not mark the user offline while other tabs remain connected.
 * Cross-node totals require a shared store (e.g. Redis); see docs/infra/realtime-scaling.md.
 */
const presenceSocketCounts = new Map<string, number>();

export function registerEchoPresenceSocket(userId: string): void {
  presenceSocketCounts.set(userId, (presenceSocketCounts.get(userId) ?? 0) + 1);
}

/** Returns remaining socket count for this user on this process after unregister. */
export function unregisterEchoPresenceSocket(userId: string): number {
  const prev = presenceSocketCounts.get(userId) ?? 0;
  const n = prev - 1;
  if (n <= 0) {
    presenceSocketCounts.delete(userId);
    return 0;
  }
  presenceSocketCounts.set(userId, n);
  return n;
}
