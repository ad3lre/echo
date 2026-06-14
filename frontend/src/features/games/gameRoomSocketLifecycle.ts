import { ref, type Ref } from 'vue';
import type {
  GameErrorMsg,
  GameEventMsg,
  GameSnapshotMsg,
} from '@shared/games';
import { postEchoVoiceGameToken } from '@/api/echo/gameServer';
import { GAME_SERVER_BASE } from '@/config';
import {
  connectGameSocket,
  type GameSocketSession,
} from '@/services/games/gameSocket';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export async function openGameRoomSocket<V>(opts: {
  gameKey: EchoVcActivityKey;
  roomId: string;
  serverId: string;
  accessToken: string;
  rev: Ref<number>;
  view: Ref<V | null>;
  lastError: Ref<GameErrorMsg | null>;
  connected: Ref<boolean>;
  epoch: number;
  connectEpoch: () => number;
  onEvent?: (msg: GameEventMsg) => void;
}): Promise<GameSocketSession | null> {
  const minted = await postEchoVoiceGameToken(
    opts.accessToken,
    opts.serverId,
    opts.roomId,
    opts.gameKey,
  );
  if (opts.epoch !== opts.connectEpoch()) return null;

  const url = minted.url?.trim() || GAME_SERVER_BASE;
  const session = connectGameSocket<V>({
    url,
    token: minted.token,
    roomId: opts.roomId,
    handlers: {
      onSnapshot: (msg: GameSnapshotMsg<V>) => {
        if (msg.rev < opts.rev.value) return;
        opts.rev.value = msg.rev;
        opts.view.value = msg.view;
        opts.lastError.value = null;
      },
      onError: (msg) => {
        opts.lastError.value = msg;
      },
      onEvent: opts.onEvent,
    },
  });
  session.socket.on('connect', () => {
    if (opts.epoch === opts.connectEpoch()) opts.connected.value = true;
  });
  session.socket.on('disconnect', () => {
    if (opts.epoch === opts.connectEpoch()) opts.connected.value = false;
  });
  return session;
}

export function teardownGameRoomSession(
  session: GameSocketSession | null,
): void {
  if (!session) return;
  session.leave();
  session.disconnect();
}
