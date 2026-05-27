import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { createSocketAdapter } from '@/services/adapters/socketAdapter';
import { nextEchoClientSnowflakeId } from '@/utils/echoClientSnowflake';
import { okResult, failResult, type ActionResult } from '@/types/actionResult';

/** Labels optimistic outbound rows before server ack (avoids "Unknown" author in the gutter). */
export type LocalAuthorEchoSnapshot = {
  displayName: string;
  avatar?: string;
};

export function optimisticAuthorEchoPatch(
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined,
): Pick<RawMessage, 'authorDisplayName' | 'authorAvatar'> {
  const o = getLocalAuthorEcho?.();
  if (!o) return {};
  const n = o.displayName.trim();
  if (!n) return {};
  return {
    authorDisplayName: n,
    ...(o.avatar?.trim() ? { authorAvatar: o.avatar.trim() } : {}),
  };
}

export type SocketAdapterInstance = NonNullable<
  ReturnType<typeof createSocketAdapter>
>;

export function newCorrelationId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newClientMessageId(): string {
  return nextEchoClientSnowflakeId();
}

export function createTryEmitRealtime(opts: {
  socketOff: () => boolean;
  getSocket: () => { readonly connected: boolean } | null;
  getAdapter: () => SocketAdapterInstance | null;
}): (emitFn: (a: SocketAdapterInstance) => void) => ActionResult {
  return (emitFn) => {
    if (opts.socketOff()) return okResult();
    if (!opts.getSocket()?.connected) {
      return failResult(
        'SOCKET_DISCONNECTED',
        'Realtime is not connected. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    const adapter = opts.getAdapter();
    if (!adapter) {
      return failResult(
        'SOCKET_ADAPTER_MISSING',
        'Realtime connection is not ready. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    emitFn(adapter);
    return okResult();
  };
}
