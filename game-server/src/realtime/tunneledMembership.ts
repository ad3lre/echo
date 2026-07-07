/** Users receiving game S2C via Echo backend relay (not direct game-server socket). */
export class TunneledMembership {
  private readonly byRoom = new Map<string, Map<string, number>>();

  add(roomId: string, userId: string): void {
    const rid = roomId.trim();
    const uid = userId.trim();
    if (!rid || !uid) return;
    let room = this.byRoom.get(rid);
    if (!room) {
      room = new Map();
      this.byRoom.set(rid, room);
    }
    room.set(uid, (room.get(uid) ?? 0) + 1);
  }

  /** Returns true when the last tunnel ref for this user in the room was removed. */
  remove(roomId: string, userId: string): boolean {
    const rid = roomId.trim();
    const uid = userId.trim();
    const room = this.byRoom.get(rid);
    if (!room) return false;
    const next = (room.get(uid) ?? 0) - 1;
    if (next <= 0) {
      room.delete(uid);
      if (!room.size) this.byRoom.delete(rid);
      return true;
    }
    room.set(uid, next);
    return false;
  }

  has(roomId: string, userId: string): boolean {
    const room = this.byRoom.get(roomId.trim());
    return (room?.get(userId.trim()) ?? 0) > 0;
  }
}
