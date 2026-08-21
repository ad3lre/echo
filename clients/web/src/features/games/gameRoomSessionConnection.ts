import { computed, type ComputedRef } from 'vue';
import type { GameErrorMsg } from '@shared/games';
import type { GameRoomApi } from '@/features/games/useGameRoom';

export type VcGameRoomConnectionRefs = {
  gameRoomConnected: ComputedRef<boolean>;
  gameRoomLastError: ComputedRef<GameErrorMsg | null>;
};

/** Reactive Socket.IO connection state for an authoritative `useGameRoom` session. */
export function vcGameRoomConnectionRefs<V>(
  room: GameRoomApi<V>,
): VcGameRoomConnectionRefs {
  return {
    gameRoomConnected: computed(() => room.connected.value),
    gameRoomLastError: computed(() => room.lastError.value),
  };
}
