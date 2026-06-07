import type { MessageFailedCode } from '@shared/types';
import {
  socketDiagDevDir,
  socketDiagDevWarn,
  socketDiagWarn,
} from '@/observability/socketDiagnostics';
import { failResult } from '@/types/actionResult';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { realtimeMessageFailedUserMessage } from '@/utils/realtimeMessageFailedUserMessage';
import { describeLastEmittedAttachmentUrls } from '@/services/realtime/attachmentSendDiag';

export type EchoMessageFailedPayload = {
  code: MessageFailedCode;
  channelId?: string;
  clientMessageId?: string;
  correlationId?: string;
  detail?: string;
  diagnostics?: Record<string, unknown>;
};

export type EchoMessageFailedIngestSink = {
  rollbackTransaction: (id: string) => void;
  /**
   * Roll back optimistic send for a channel + client message id; return draft
   * content for the `echo-message-failed` window event when the row existed.
   */
  rollbackOptimisticClientMessage: (
    channelId: string,
    clientMessageId: string,
  ) => string | undefined;
  prunePendingClientMessages: (nowMs: number) => void;
  dispatchEchoMessageFailed: (detail: Record<string, unknown>) => void;
};

/** Inbound `message_failed`: tx rollback, optimistic cleanup, user / dev surfacing, window hook. */
export function ingestEchoMessageFailed(
  payload: EchoMessageFailedPayload,
  sink: EchoMessageFailedIngestSink,
): void {
  socketDiagWarn('onMessageFailed', {
    code: payload.code,
    channelId: payload.channelId,
    clientMessageId: payload.clientMessageId,
    correlationId: payload.correlationId,
    detail: payload.detail,
    hasDiagnostics: !!payload.diagnostics,
  });
  const corr =
    typeof payload.correlationId === 'string'
      ? payload.correlationId.trim()
      : '';
  if (corr) {
    sink.rollbackTransaction(corr);
  }
  const cid = payload.channelId;
  const mid = payload.clientMessageId;
  let draftContent: string | undefined;
  if (cid && mid) {
    draftContent = sink.rollbackOptimisticClientMessage(cid, mid);
  }
  sink.prunePendingClientMessages(Date.now());

  const rawDetail = payload.detail != null ? String(payload.detail).trim() : '';
  let detailForLog = rawDetail || '(no detail from server)';
  // Attachment rejections are otherwise undebuggable from the UI: append the
  // URL(s) of the just-emitted message so the offending value is visible.
  if (/attachment/i.test(rawDetail)) {
    const urls = describeLastEmittedAttachmentUrls();
    if (urls) detailForLog = `${detailForLog} — sent: ${urls}`;
  }
  const userFacingDetail = realtimeMessageFailedUserMessage(
    payload.code,
    rawDetail,
  );

  if (payload.clientMessageId) {
    reportPrimaryFlowFailure(
      'socket.message_failed',
      new Error(`${payload.code}: ${detailForLog}`),
      {
        code: payload.code,
        channelId: payload.channelId,
        clientMessageId: payload.clientMessageId,
      },
    );
  } else {
    const fr = failResult(String(payload.code), userFacingDetail, true);
    propagateActionFailure(fr, {
      flow: 'socket.message_failed',
      context: 'realtime_message_action',
      extraContext: { channelId: payload.channelId, code: payload.code },
    });
  }
  socketDiagDevWarn('message_failed', {
    code: payload.code,
    detailForLog,
  });
  if (payload.diagnostics && typeof payload.diagnostics === 'object') {
    socketDiagDevDir('message_failed_diagnostics', payload.diagnostics);
  }
  sink.dispatchEchoMessageFailed({ ...payload, draftContent });
}
