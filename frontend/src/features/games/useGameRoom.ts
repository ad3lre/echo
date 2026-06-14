import {
  computed,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';
import type { GameErrorMsg, GameEventMsg } from '@shared/games';
import {
  openGameRoomSocket,
  teardownGameRoomSession,
} from '@/features/games/gameRoomSocketLifecycle';
import type { GameSocketSession } from '@/services/games/gameSocket';

export type UseGameRoomOpts<V> = {
  gameKey: EchoVcActivityKey;
  roomId: ComputedRef<string | null>;
  serverId: ComputedRef<string | null>;
  accessToken: ComputedRef<string | null>;
  enabled: ComputedRef<boolean>;
  onEvent?: (msg: GameEventMsg) => void;
};

export type GameRoomApi<V> = {
  view: Ref<V | null>;
  rev: Ref<number>;
  connected: Ref<boolean>;
  lastError: Ref<GameErrorMsg | null>;
  sendAction: (type: string, payload?: unknown) => void;
};

/**
 * Authoritative VC game room: mints a backend token, connects Socket.IO to the
 * game server, and keeps the latest per-viewer snapshot in a reactive ref.
 */
export function useGameRoom<V>(opts: UseGameRoomOpts<V>): GameRoomApi<V> {
  const view = ref<V | null>(null) as Ref<V | null>;
  const rev = ref(0);
  const connected = ref(false);
  const lastError = ref<GameErrorMsg | null>(null);
  let session: GameSocketSession | null = null;
  let connectEpoch = 0;

  function resetLocal(): void {
    connected.value = false;
    view.value = null;
    rev.value = 0;
  }

  function teardown(): void {
    teardownGameRoomSession(session);
    session = null;
    resetLocal();
  }

  async function connect(): Promise<void> {
    const epoch = ++connectEpoch;
    teardown();
    const roomId = opts.roomId.value?.trim() ?? '';
    const serverId = opts.serverId.value?.trim() ?? '';
    const token = opts.accessToken.value?.trim() ?? '';
    if (!roomId || !serverId || !token || !opts.enabled.value) return;

    try {
      session = await openGameRoomSocket<V>({
        gameKey: opts.gameKey,
        roomId,
        serverId,
        accessToken: token,
        rev,
        view,
        lastError,
        connected,
        epoch,
        connectEpoch: () => connectEpoch,
        onEvent: opts.onEvent,
      });
    } catch {
      if (epoch === connectEpoch) {
        resetLocal();
        lastError.value = { reason: 'unauthorized' };
      }
    }
  }

  watch(
    () => ({
      enabled: opts.enabled.value,
      roomId: opts.roomId.value,
      serverId: opts.serverId.value,
      token: opts.accessToken.value,
    }),
    () => {
      void connect();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    connectEpoch++;
    teardown();
  });

  return {
    view,
    rev,
    connected,
    lastError,
    sendAction: (type, payload) => {
      session?.sendAction({ type, payload });
    },
  };
}
