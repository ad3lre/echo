import { io, type Socket } from 'socket.io-client';
import {
  GAME_C2S,
  GAME_S2C,
  type GameActionMsg,
  type GameErrorMsg,
  type GameEventMsg,
  type GameSnapshotMsg,
} from '@shared/games';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export type GameSocketHandlers<V> = {
  onSnapshot: (msg: GameSnapshotMsg<V>) => void;
  onEvent?: (msg: GameEventMsg) => void;
  onError?: (msg: GameErrorMsg) => void;
};

export type GameSocketSession = {
  socket: Socket;
  sendAction: (msg: Omit<GameActionMsg, 'roomId'>) => void;
  leave: () => void;
  disconnect: () => void;
};

/**
 * Open a credentialed Socket.IO session to the authoritative game server.
 * Auth is the backend-minted HS256 token in the handshake (`auth.token`).
 */
export function connectGameSocket<V>(opts: {
  url: string;
  token: string;
  roomId: string;
  handlers: GameSocketHandlers<V>;
}): GameSocketSession {
  const socket = io(opts.url, {
    auth: { token: opts.token },
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    forceNew: true,
  });

  socket.on(GAME_S2C.snapshot, (msg: GameSnapshotMsg<V>) => {
    if (!msg || msg.roomId !== opts.roomId) return;
    opts.handlers.onSnapshot(msg);
  });
  socket.on(GAME_S2C.event, (msg: GameEventMsg) => {
    if (!msg || msg.roomId !== opts.roomId) return;
    opts.handlers.onEvent?.(msg);
  });
  socket.on(GAME_S2C.error, (msg: GameErrorMsg) => {
    opts.handlers.onError?.(msg);
  });

  return {
    socket,
    sendAction: (msg) => {
      socket.emit(GAME_C2S.action, { roomId: opts.roomId, ...msg });
    },
    leave: () => {
      socket.emit(GAME_C2S.leave, { roomId: opts.roomId });
    },
    disconnect: () => {
      socket.disconnect();
    },
  };
}

export type { EchoVcActivityKey };
