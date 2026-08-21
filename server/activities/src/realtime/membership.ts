/**
 * Ref-counts a user's sockets per room so we call `RoomManager.join` on a user's
 * first socket and `leave` only when their last socket goes (a user may have
 * several tabs / a reconnect in flight). Single-process; multi-node membership
 * is a documented later concern.
 */
export class MembershipTracker {
  private readonly rooms = new Map<string, Map<string, number>>();

  /** @returns true when this is the user's first socket in the room. */
  add(roomId: string, userId: string): boolean {
    let m = this.rooms.get(roomId);
    if (!m) {
      m = new Map();
      this.rooms.set(roomId, m);
    }
    const n = (m.get(userId) ?? 0) + 1;
    m.set(userId, n);
    return n === 1;
  }

  /** @returns true when the user has no sockets left in the room. */
  remove(roomId: string, userId: string): boolean {
    const m = this.rooms.get(roomId);
    if (!m) return false;
    const n = (m.get(userId) ?? 0) - 1;
    if (n <= 0) {
      m.delete(userId);
      if (m.size === 0) this.rooms.delete(roomId);
      return true;
    }
    m.set(userId, n);
    return false;
  }
}
