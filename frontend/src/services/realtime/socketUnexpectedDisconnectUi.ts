import { UIErrorBus } from '@/utils/uiErrorBus';

export const SOCKET_UNEXPECTED_DISCONNECT_UI_COOLDOWN_MS = 8000;

export type SocketUnexpectedDisconnectUiEmit = {
  context: string;
  severity: 'info';
  userMessage: string;
  code: string;
  retryable: boolean;
};

/**
 * User-visible info when Socket.IO drops unexpectedly (not voluntary client disconnect).
 * Throttles repeated toasts within {@link SOCKET_UNEXPECTED_DISCONNECT_UI_COOLDOWN_MS}.
 *
 * @returns `true` if a banner was emitted — caller should set `lastEmitAtMs = nowMs`.
 */
export function maybeEmitEchoSocketUnexpectedDisconnectUi(
  args: {
    reason: string;
    socketOff: () => boolean;
    nowMs: number;
    lastEmitAtMs: number;
    cooldownMs?: number;
  },
  emit: (detail: SocketUnexpectedDisconnectUiEmit) => void = (d) =>
    UIErrorBus.emit(d),
): boolean {
  if (args.socketOff()) return false;
  if (args.reason === 'io client disconnect') return false;
  const cd = args.cooldownMs ?? SOCKET_UNEXPECTED_DISCONNECT_UI_COOLDOWN_MS;
  if (args.nowMs - args.lastEmitAtMs < cd) return false;
  emit({
    context: 'socket_disconnect',
    severity: 'info',
    userMessage:
      'Realtime disconnected. Echo will try to reconnect automatically.',
    code: 'SOCKET_UNEXPECTED_DISCONNECT',
    retryable: false,
  });
  return true;
}
