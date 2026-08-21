import { socketDiagInfo } from '@/observability/socketDiagnostics';
import { failResult } from '@/features/layout/actionResult';
import { propagateActionFailure } from '@/features/layout/failures/actionFailurePropagation';

export type EchoPollVoteFailedPayload = {
  code: string;
  channelId?: string;
  messageId?: string;
  detail?: string;
};

/** Realtime `poll:vote_failed`: user-facing action failure + diagnostics. */
export function handleEchoPollVoteFailed(
  payload: EchoPollVoteFailedPayload,
): void {
  socketDiagInfo('poll_vote_failed', {
    code: payload.code,
    detail: payload.detail ?? '',
  });
  const detail =
    (payload.detail && String(payload.detail).trim()) ||
    'Could not record your poll vote. Try again.';
  const fr = failResult(String(payload.code), detail, true);
  propagateActionFailure(fr, {
    flow: 'socket.poll_vote_failed',
    context: 'poll_vote',
    extraContext: {
      channelId: payload.channelId,
      messageId: payload.messageId,
    },
  });
}
