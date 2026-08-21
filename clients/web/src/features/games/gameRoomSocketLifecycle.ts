import type { Ref } from 'vue';
import type {
  GameErrorMsg,
  GameEventMsg,
  GameSnapshotMsg,
} from '@shared/games';
import {
  connectGameSocketViaEcho,
  type GameSocketSession,
} from '@/features/games/gameSocket';
import { getEchoGameSocket } from '@/features/games/echoGameSocketRegistry';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export async function openGameRoomSocket<V>(opts: {
  gameKey: EchoVcActivityKey;
  roomId: string;
  rev: Ref<number>;
  view: Ref<V | null>;
  lastError: Ref<GameErrorMsg | null>;
  connected: Ref<boolean>;
  epoch: number;
  connectEpoch: () => number;
  onEvent?: (msg: GameEventMsg) => void;
}): Promise<GameSocketSession | null> {
  if (opts.epoch !== opts.connectEpoch()) return null;

  const socket = getEchoGameSocket();
  if (!socket) {
    if (opts.epoch === opts.connectEpoch()) {
      opts.lastError.value = { reason: 'not_configured' };
    }
    return null;
  }

  const session = connectGameSocketViaEcho<V>({
    socket,
    roomId: opts.roomId,
    gameKey: opts.gameKey,
    handlers: {
      onSnapshot: (msg: GameSnapshotMsg<V>) => {
        if (msg.rev < opts.rev.value) return;
        opts.rev.value = msg.rev;
        opts.view.value = msg.view;
        opts.lastError.value = null;
        if (opts.epoch === opts.connectEpoch()) opts.connected.value = true;
      },
      onError: (msg) => {
        opts.lastError.value = msg;
        if (opts.epoch === opts.connectEpoch()) opts.connected.value = false;
      },
      onEvent: opts.onEvent,
    },
  });

  const markConnected = () => {
    if (opts.epoch === opts.connectEpoch() && socket.connected) {
      opts.connected.value = true;
    }
  };
  const markDisconnected = () => {
    if (opts.epoch === opts.connectEpoch()) opts.connected.value = false;
  };
  socket.on('connect', markConnected);
  socket.on('disconnect', markDisconnected);
  if (socket.connected) markConnected();

  const priorDisconnect = session.disconnect;
  session.disconnect = () => {
    socket.off('connect', markConnected);
    socket.off('disconnect', markDisconnected);
    priorDisconnect();
  };

  return session;
}

export function teardownGameRoomSession(
  session: GameSocketSession | null,
): void {
  if (!session) return;
  session.leave();
  session.disconnect();
}
