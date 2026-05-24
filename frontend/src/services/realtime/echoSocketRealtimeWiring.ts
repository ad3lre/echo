import type { Ref } from 'vue';
import { SOCKET_IO_BASE } from '@/config';
import type { EchoRealtimePort } from '@/services/realtime/echoRealtimePort';
import { SOCKET_DISABLED } from '@/services/realtime/socketTransport';
import type { EchoSocketInboundListeners } from '@/services/realtime/socketInbound';
import {
  createEchoSocketIoState,
  createEchoSocketSessionLifecycle,
  type EchoSocketIoState,
  type EchoSocketTryEmitRealtime,
} from '@/services/realtime/echoSocketSessionLifecycle';
import { createTryEmitRealtime } from '@/services/realtime/socketOutbound';

export type EchoSocketTransportSurface = {
  io: EchoSocketIoState;
  socketOff: () => boolean;
  tryEmitRealtime: EchoSocketTryEmitRealtime;
  getSocketConnected: () => boolean;
  getAdapter: () => unknown;
  activeChannelId: Ref<string>;
};

export type EchoSocketDomainWiring = {
  port: EchoRealtimePort;
  inboundListeners: EchoSocketInboundListeners;
  onBeforeTeardown?: () => void;
  onAfterConnected?: (ctx: {
    activeChannelId: string | undefined;
    rawSocketEmitJoinChannel: (channelId: string) => void;
  }) => void;
  onAfterDisconnect?: () => void;
};

export type EchoSocketRealtimeWiringDeps = {
  activeChannelId: Ref<string>;
  /** Runs when the tab/network resumes while Socket.IO is already connected. */
  onTabResumeWhileConnected?: () => void;
  createDomain: (
    transport: EchoSocketTransportSurface,
  ) => EchoSocketDomainWiring;
};

export type EchoSocketRealtimeWiring = {
  port: EchoRealtimePort;
  io: ReturnType<typeof createEchoSocketIoState>;
  socketOff: () => boolean;
  connectSocket: () => Promise<void>;
  teardownSocket: () => void;
  disposeSocketComposable: () => void;
  mountWindowAndIdle: () => void;
};

/** Transport-only assembly; domain supplies handlers and outbound surface. */
export function createEchoSocketRealtimeWiring(
  deps: EchoSocketRealtimeWiringDeps,
): EchoSocketRealtimeWiring {
  function socketOff(): boolean {
    return SOCKET_DISABLED;
  }

  const io = createEchoSocketIoState();

  const tryEmitRealtime = createTryEmitRealtime({
    socketOff,
    getSocket: () => io.socket,
    getAdapter: () => io.adapter,
  });

  const domain = deps.createDomain({
    io,
    socketOff,
    tryEmitRealtime,
    getSocketConnected: () => Boolean(io.socket?.connected),
    getAdapter: () => io.adapter,
    activeChannelId: deps.activeChannelId,
  });

  const {
    connectSocket,
    teardownSocket,
    disposeSocketComposable,
    mountWindowAndIdle,
  } = createEchoSocketSessionLifecycle({
    io,
    socketOff,
    socketIoBase: SOCKET_IO_BASE,
    getInboundListeners: () => domain.inboundListeners,
    tryEmitRealtime,
    activeChannelId: deps.activeChannelId,
    onTabResumeWhileConnected: deps.onTabResumeWhileConnected,
    onBeforeTeardown: domain.onBeforeTeardown,
    onAfterConnected: domain.onAfterConnected,
    onAfterDisconnect: domain.onAfterDisconnect,
  });

  return {
    port: domain.port,
    io,
    socketOff,
    connectSocket,
    teardownSocket,
    disposeSocketComposable,
    mountWindowAndIdle,
  };
}
