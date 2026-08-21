import type { JoinChannelErrorPayload } from '@shared/types';
import { socketDiagWarn } from '@/observability/socketDiagnostics';

export function isJoinChannelErrorPayload(
  payload: unknown,
): payload is JoinChannelErrorPayload {
  if (!payload || typeof payload !== 'object') return false;
  const row = payload as Record<string, unknown>;
  const code = row.code;
  const channelId = row.channelId;
  return (
    typeof channelId === 'string' &&
    channelId.trim().length > 0 &&
    (code === 'UNAUTHENTICATED' ||
      code === 'UNAVAILABLE' ||
      code === 'FORBIDDEN' ||
      code === 'NOT_FOUND')
  );
}

export type EchoSocketJoinChannelErrorIngestCtx = {
  activeChannelId: () => string | undefined;
  onPermissionDenied: (payload: JoinChannelErrorPayload) => void;
};

/**
 * Handles structured server `error` events for failed channel subscriptions.
 */
export function ingestEchoSocketJoinChannelError(
  payload: unknown,
  ctx: EchoSocketJoinChannelErrorIngestCtx,
): void {
  if (!isJoinChannelErrorPayload(payload)) return;
  socketDiagWarn('join_channel_denied', {
    code: payload.code,
    channelId: payload.channelId,
    detail: payload.detail,
  });
  if (
    payload.code === 'FORBIDDEN' ||
    payload.code === 'NOT_FOUND' ||
    payload.code === 'UNAUTHENTICATED'
  ) {
    const active = ctx.activeChannelId()?.trim();
    if (active && active === payload.channelId.trim()) {
      ctx.onPermissionDenied(payload);
    }
  }
}
