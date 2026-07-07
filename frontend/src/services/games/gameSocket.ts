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
 * Tunnel VC game traffic through the existing Echo Socket.IO session.
 */
export function connectGameSocketViaEcho<V>(opts: {
  socket: Socket;
  roomId: string;
  gameKey: EchoVcActivityKey;
  handlers: GameSocketHandlers<V>;
}): GameSocketSession {
  const onSnapshot = (msg: GameSnapshotMsg<V>) => {
    if (!msg || msg.roomId !== opts.roomId) return;
    opts.handlers.onSnapshot(msg);
  };
  const onEvent = (msg: GameEventMsg) => {
    if (!msg || msg.roomId !== opts.roomId) return;
    opts.handlers.onEvent?.(msg);
  };
  const onError = (msg: GameErrorMsg) => {
    opts.handlers.onError?.(msg);
  };

  opts.socket.on(GAME_S2C.snapshot, onSnapshot);
  opts.socket.on(GAME_S2C.event, onEvent);
  opts.socket.on(GAME_S2C.error, onError);

  const emitJoin = () => {
    opts.socket.emit(GAME_C2S.join, {
      roomId: opts.roomId,
      gameKey: opts.gameKey,
    });
  };
  if (opts.socket.connected) emitJoin();
  else opts.socket.once('connect', emitJoin);

  const teardownListeners = () => {
    opts.socket.off(GAME_S2C.snapshot, onSnapshot);
    opts.socket.off(GAME_S2C.event, onEvent);
    opts.socket.off(GAME_S2C.error, onError);
    opts.socket.off('connect', emitJoin);
  };

  return {
    socket: opts.socket,
    sendAction: (msg) => {
      opts.socket.emit(GAME_C2S.action, { roomId: opts.roomId, ...msg });
    },
    leave: () => {
      opts.socket.emit(GAME_C2S.leave, { roomId: opts.roomId });
    },
    disconnect: () => {
      teardownListeners();
    },
  };
}

/**
 * Open a credentialed Socket.IO session to the authoritative game server.
 * Auth is the backend-minted HS256 token in the handshake (`auth.token`).
 * Prefer {@link connectGameSocketViaEcho} for browser clients.
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
  socket.on('connect_error', (err: Error) => {
    opts.handlers.onError?.({
      reason: err.message?.toLowerCase().includes('unauthorized')
        ? 'unauthorized'
        : 'rejected',
    });
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
