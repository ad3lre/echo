import type { LiveKitWebhookEnvelope, RoomSnapshot } from '../types';

type RoomState = {
  roomName: string;
  participants: Set<string>;
  updatedAtMs: number;
};

export class StateBuilder {
  private readonly rooms = new Map<string, RoomState>();

  ingestLiveKitWebhook(envelope: LiveKitWebhookEnvelope): RoomSnapshot | null {
    const roomName = envelope.room?.name?.trim();
    if (!roomName) return null;

    const now = Date.now();
    const event = (envelope.event ?? '').toString();
    const identity = envelope.participant?.identity?.trim();

    const room =
      this.rooms.get(roomName) ??
      (() => {
        const r: RoomState = {
          roomName,
          participants: new Set<string>(),
          updatedAtMs: now,
        };
        this.rooms.set(roomName, r);
        return r;
      })();

    if (event === 'participant_joined' && identity)
      room.participants.add(identity);
    if (event === 'participant_left' && identity)
      room.participants.delete(identity);
    room.updatedAtMs = now;

    return {
      roomName,
      participantIdentities: [...room.participants.values()],
      updatedAtMs: room.updatedAtMs,
    };
  }

  getRoomSnapshot(roomName: string): RoomSnapshot | null {
    const r = this.rooms.get(roomName);
    if (!r) return null;
    return {
      roomName: r.roomName,
      participantIdentities: [...r.participants.values()],
      updatedAtMs: r.updatedAtMs,
    };
  }
}
