import type { DesiredRoomControl, RoomSnapshot } from '../types';

/**
 * Layer 2 job #2: PURE function snapshot -> desired.
 * No I/O, no timers, no SDK calls.
 */
export function evaluatePolicy(snapshot: RoomSnapshot): DesiredRoomControl {
  return {
    roomName: snapshot.roomName,
  };
}
