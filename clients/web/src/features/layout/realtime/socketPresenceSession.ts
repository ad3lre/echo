/**
 * Outbound presence relay over Socket.IO: initial `presence:set` on connect and
 * periodic `presence:heartbeat` while connected.
 */

import { normalizeCanonicalPresenceStatus } from '@/features/layout/presence';
import { echoOutboundPresenceActiveClient } from '@/features/layout/echoWorkspace/echoOutboundPresenceClient';

export const ECHO_PRESENCE_HEARTBEAT_INTERVAL_MS = 120_000;

export type EchoRelayablePresenceStatus =
  | 'online'
  | 'idle'
  | 'do_not_disturb'
  | 'offline';

export function parseRelayablePresenceStatus(
  status: string | undefined,
): EchoRelayablePresenceStatus | undefined {
  return normalizeCanonicalPresenceStatus(status);
}

/** Narrow surface for presence emits; widened at call sites from `EchoSocketAdapter`. */
export type PresenceEmitAdapter = {
  emit: (event: string, ...args: unknown[]) => void;
} | null;

export function toPresenceEmitAdapter(
  adapter:
    | { emit: (event: string, ...args: unknown[]) => void }
    | null
    | undefined,
): PresenceEmitAdapter {
  if (!adapter) return null;
  if (typeof adapter.emit !== 'function') return null;
  return adapter;
}

export type TryEmitPresenceSetOptions = {
  /**
   * When `status` is missing or not a known canonical value, use this for `presence:set`.
   * Does not override an explicit canonical status (e.g. user-chosen `offline`).
   */
  fallbackIfUnspecified?: EchoRelayablePresenceStatus;
};

export function resolveRelayablePresenceForOutbound(
  status: string | undefined,
  fallback: EchoRelayablePresenceStatus,
): EchoRelayablePresenceStatus {
  return parseRelayablePresenceStatus(status) ?? fallback;
}

export function tryEmitPresenceSet(
  adapter: PresenceEmitAdapter,
  socketConnected: boolean,
  status: string | undefined,
  opts?: TryEmitPresenceSetOptions,
): void {
  const st =
    parseRelayablePresenceStatus(status) ?? opts?.fallbackIfUnspecified;
  if (!adapter || !socketConnected || !st) return;
  const client = echoOutboundPresenceActiveClient();
  adapter.emit('presence:set', {
    status: st,
    client,
  });
}

export function tryEmitPresenceHeartbeat(
  adapter: PresenceEmitAdapter,
  socketConnected: boolean,
  status: EchoRelayablePresenceStatus,
): void {
  if (!adapter || !socketConnected) return;
  const client = echoOutboundPresenceActiveClient();
  adapter.emit('presence:heartbeat', { status, client });
}

export function createPresenceHeartbeatSession(deps: {
  getAdapter: () => PresenceEmitAdapter;
  getSocketConnected: () => boolean;
  intervalMs?: number;
}): {
  start: (status: string | undefined) => void;
  stop: () => void;
} {
  const intervalMs = deps.intervalMs ?? ECHO_PRESENCE_HEARTBEAT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(status: string | undefined) {
    stop();
    const st = parseRelayablePresenceStatus(status);
    if (!st || !deps.getSocketConnected()) return;
    timer = setInterval(() => {
      tryEmitPresenceHeartbeat(
        deps.getAdapter(),
        deps.getSocketConnected(),
        st,
      );
    }, intervalMs);
  }

  return { start, stop };
}
