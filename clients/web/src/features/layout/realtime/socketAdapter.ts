import type { ClientToServerEvents } from '@shared/types';

/** Payload type for outbound `message` emits (matches shared socket contract). */
export type EchoOutboundMessagePayload = Parameters<
  ClientToServerEvents['message']
>[0];

export type ClientToServerPayload<K extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[K]>[0];

/**
 * Narrow emit surface so the adapter stays testable without importing socket.io overloads.
 * Real Socket.IO clients satisfy this at runtime.
 */
export type SocketAdapterSurface = {
  emit(event: string, ...args: unknown[]): void;
};

export function createSocketAdapter(socket: SocketAdapterSurface | null) {
  return {
    sendMessage(payload: EchoOutboundMessagePayload) {
      if (!socket) return;
      socket.emit('message', payload);
    },
    emit<K extends keyof ClientToServerEvents>(
      event: K,
      payload: ClientToServerPayload<K>,
    ) {
      if (!socket) return;
      socket.emit(event as string, payload);
    },
  };
}

export type EchoSocketAdapter = ReturnType<typeof createSocketAdapter>;
