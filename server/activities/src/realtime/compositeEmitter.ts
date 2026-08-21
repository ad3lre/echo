import type { Server } from 'socket.io';
import { GAME_S2C } from '../../cores/games';
import type { GameEmitter } from '../core/GameInstance';
import type { EchoRelayPoster } from './echoRelayPoster';
import type { TunneledMembership } from './tunneledMembership';

const roomChannel = (roomId: string): string => `r:${roomId}`;
const userChannel = (roomId: string, userId: string): string =>
  `u:${roomId}:${userId}`;

export function makeCompositeEmitter(
  io: Server,
  roomId: string,
  tunneled: TunneledMembership,
  relay: EchoRelayPoster | null,
): GameEmitter {
  return {
    snapshotToUser: (userId, msg) => {
      if (tunneled.has(roomId, userId)) {
        relay?.postSnapshot(userId, msg);
        return;
      }
      void io.to(userChannel(roomId, userId)).emit(GAME_S2C.snapshot, msg);
    },
    eventToUser: (userId, msg) => {
      if (tunneled.has(roomId, userId)) {
        relay?.postEventToUser(userId, msg);
        return;
      }
      void io.to(userChannel(roomId, userId)).emit(GAME_S2C.event, msg);
    },
    eventToRoom: (msg) => {
      relay?.postEventToRoom(msg);
      void io.to(roomChannel(roomId)).emit(GAME_S2C.event, msg);
    },
  };
}
