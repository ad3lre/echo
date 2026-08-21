import type { Socket } from 'socket.io-client';
import {
  createSocketAdapter,
  type SocketAdapterSurface,
} from '@/features/layout/realtime/socketAdapter';
import {
  attachEchoSocketInbound,
  detachEchoSocketInbound,
  type EchoSocketInboundListeners,
} from '@/features/layout/realtime/socketInbound';
import type { SocketAdapterInstance } from '@/features/layout/realtime/socketOutbound';
import { bindPaperWatchSocket } from '@/features/paper/paperWatchSocketBridge';

/** Socket.IO manager options shared by `useSocket` `connectSocket`. */
export function echoSocketIoManagerOptions(): {
  path: string;
  reconnection: boolean;
  transports: ('polling' | 'websocket')[];
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  randomizationFactor: number;
  withCredentials: boolean;
} {
  return {
    path: '/socket.io',
    reconnection: true,
    // Polling first: Engine.IO long-polling carries credentialed cookies reliably. WebSocket-first
    // fails on some Safari / mobile networks and locked-down proxies; dev Vite `/socket.io` proxy
    // is also flaky for upgrades — same order everywhere keeps realtime consistent.
    transports: ['polling', 'websocket'],
    /** Unbounded retries; tab resume also hard-recycles via `tryResumeEchoSocketConnection`. */
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    /** Session cookies (`echo_sid`) authenticate the handshake (same-origin / credentialed cross-origin to API). */
    withCredentials: true,
  };
}

/**
 * After `io()` resolves: adapter + inbound attach. Domain owns join/presence/typing policy.
 */
export function bootstrapEchoSocketAdapterSession(opts: {
  rawSocket: Socket;
  inboundListeners: EchoSocketInboundListeners;
}): SocketAdapterInstance {
  const adapter = createSocketAdapter(
    opts.rawSocket as unknown as SocketAdapterSurface,
  );
  attachEchoSocketInbound(opts.rawSocket, opts.inboundListeners);
  return adapter;
}

/**
 * Detach inbound handlers, mark disconnected, clear adapter ref, disconnect, clear socket ref.
 * Caller owns any higher-level domain teardown hooks.
 */
export function teardownEchoSocketClientSession(opts: {
  socket: Socket;
  inboundListeners: EchoSocketInboundListeners;
  beforeDisconnect: () => void;
  afterDisconnect: () => void;
}): void {
  detachEchoSocketInbound(opts.socket, opts.inboundListeners);
  bindPaperWatchSocket(null);
  opts.beforeDisconnect();
  opts.socket.disconnect();
  opts.afterDisconnect();
}
