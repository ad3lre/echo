import type { EchoSocketAdapter } from '@/services/adapters/socketAdapter';
import { executeEchoSocketConnectAttempt } from '@/services/realtime/socketConnectOrchestrator';
import {
  attachEchoSocketWindowResumeListeners,
  scheduleEchoSocketInitialConnect,
  tryResumeEchoSocketConnection,
} from '@/services/realtime/socketClientResumeAndWindow';
import {
  bootstrapEchoSocketAdapterSession,
  teardownEchoSocketClientSession,
} from '@/services/realtime/socketIoSessionWire';
import type { EchoSocketInboundListeners } from '@/services/realtime/socketInbound';
import { createTryEmitRealtime } from '@/services/realtime/socketOutbound';

export type EchoSocketIoState = {
  socket: import('socket.io-client').Socket | null;
  adapter: EchoSocketAdapter | null;
  lastChannelId: string | null;
  connectGeneration: number;
  connectInFlight: Promise<void> | null;
};

export function createEchoSocketIoState(): EchoSocketIoState {
  return {
    socket: null,
    adapter: null,
    lastChannelId: null,
    connectGeneration: 0,
    connectInFlight: null,
  };
}

export type EchoSocketTryEmitRealtime = ReturnType<
  typeof createTryEmitRealtime
>;

export function createEchoSocketSessionLifecycle(opts: {
  io: EchoSocketIoState;
  socketOff: () => boolean;
  socketIoBase: string;
  getInboundListeners: () => EchoSocketInboundListeners;
  tryEmitRealtime: EchoSocketTryEmitRealtime;
  activeChannelId: import('vue').Ref<string>;
  onTabResumeWhileConnected?: () => void;
  onBeforeTeardown?: () => void;
  onAfterConnected?: (ctx: {
    activeChannelId: string | undefined;
    rawSocketEmitJoinChannel: (channelId: string) => void;
  }) => void;
  onAfterDisconnect?: () => void;
}): {
  connectSocket: () => Promise<void>;
  teardownSocket: () => void;
  resumeRealtimeIfNeeded: () => void;
  cancelIdleConnectScheduling: () => void;
  removeSocketWindowListeners: () => void;
  disposeSocketComposable: () => void;
  mountWindowAndIdle: () => void;
} {
  const io = opts.io;
  let idleCancel: (() => void) | null = null;
  let detachWindowResumeListeners: (() => void) | null = null;

  function connectSocket(): Promise<void> {
    if (opts.socketOff()) return Promise.resolve();
    if (io.socket?.connected) return Promise.resolve();
    if (io.connectInFlight) return io.connectInFlight;

    const startGen = io.connectGeneration;
    io.connectInFlight = (async () => {
      try {
        await executeEchoSocketConnectAttempt({
          socketOff: opts.socketOff,
          startGen,
          getCurrentGeneration: () => io.connectGeneration,
          isSocketConnected: () => Boolean(io.socket?.connected),
          discardDisconnectedSocket: () => {
            if (io.socket) {
              io.socket.disconnect();
              io.socket = null;
            }
          },
          socketIoBase: opts.socketIoBase,
          importSocketIoClient: () => import('socket.io-client'),
          afterConnectedSocket: (client) => {
            io.socket = client;
            io.adapter = bootstrapEchoSocketAdapterSession({
              rawSocket: client,
              inboundListeners: opts.getInboundListeners(),
            });
            const notifyConnected = () => {
              const id = opts.activeChannelId.value;
              opts.onAfterConnected?.({
                activeChannelId: id || undefined,
                rawSocketEmitJoinChannel: (channelId: string) => {
                  io.socket?.emit('joinChannel', channelId);
                },
              });
            };
            client.on('connect', notifyConnected);
            if (client.connected) {
              notifyConnected();
            }
          },
        });
      } finally {
        io.connectInFlight = null;
      }
    })();

    return io.connectInFlight;
  }

  function teardownSocket() {
    io.connectGeneration += 1;
    opts.onBeforeTeardown?.();
    if (!io.socket) return;
    teardownEchoSocketClientSession({
      socket: io.socket,
      inboundListeners: opts.getInboundListeners(),
      beforeDisconnect: () => {
        io.adapter = null;
      },
      afterDisconnect: () => {
        io.socket = null;
      },
    });
    io.lastChannelId = null;
    opts.onAfterDisconnect?.();
  }

  function resumeRealtimeIfNeeded() {
    tryResumeEchoSocketConnection({
      socketOff: opts.socketOff,
      getConnected: () => Boolean(io.socket?.connected),
      ensureConnect: () => connectSocket(),
      onConnectedResume: opts.onTabResumeWhileConnected,
    });
  }

  function cancelIdleConnectScheduling() {
    idleCancel?.();
    idleCancel = null;
  }

  function removeSocketWindowListeners() {
    detachWindowResumeListeners?.();
    detachWindowResumeListeners = null;
  }

  function disposeSocketComposable() {
    cancelIdleConnectScheduling();
    removeSocketWindowListeners();
    teardownSocket();
  }

  function mountWindowAndIdle() {
    if (opts.socketOff()) return;
    idleCancel = scheduleEchoSocketInitialConnect({
      onConnect: () => {
        void connectSocket();
      },
    });
    detachWindowResumeListeners = attachEchoSocketWindowResumeListeners({
      socketOff: opts.socketOff,
      onPersistedPageHide: teardownSocket,
      onPersistedPageShow: () => {
        void connectSocket();
      },
      onResumeRealtime: resumeRealtimeIfNeeded,
    });
  }

  return {
    connectSocket,
    teardownSocket,
    resumeRealtimeIfNeeded,
    cancelIdleConnectScheduling,
    removeSocketWindowListeners,
    disposeSocketComposable,
    mountWindowAndIdle,
  };
}

export function applyEchoSocketActiveChannelChange(
  io: EchoSocketIoState,
  nextId: string,
): void {
  if (!io.socket?.connected) return;
  if (io.lastChannelId && io.lastChannelId !== nextId) {
    io.adapter?.emit('leaveChannel', io.lastChannelId);
  }
  if (nextId) {
    io.adapter?.emit('joinChannel', nextId);
    io.lastChannelId = nextId;
  } else {
    io.lastChannelId = null;
  }
}

export function shouldRecycleEchoSocketOnAuthChange(
  next: readonly [boolean, string | null | undefined],
  prev: readonly [boolean, string | null | undefined] | undefined,
): boolean {
  if (prev && next[0] === prev[0] && next[1] === prev[1]) return false;
  return true;
}
