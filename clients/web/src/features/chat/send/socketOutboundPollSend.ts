import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { MentionEntity, PollData, ReplyTo } from '@shared/types';
import {
  optimisticAuthorEchoPatch,
  type LocalAuthorEchoSnapshot,
  type SocketAdapterInstance,
} from '@/features/layout/realtime/socketOutbound';

export type OutboundPollUiTransactionSink = {
  beginTransaction: (tx: {
    id: string;
    type: 'message-send';
    state: 'pending';
    channelId: string;
    clientMessageId: string;
  }) => void;
  rollbackTransaction: (clientMessageId: string) => void;
};

/**
 * Poll-only outbound path from `useSocket` `sendMessage`: optimistic UI when connected + author,
 * adapter send with correlation id, offline local-only append.
 */
export function sendOutboundPollMessage(opts: {
  channelId: string;
  content: string;
  mentions?: MentionEntity[];
  replyTo?: ReplyTo;
  poll: PollData;
  authorId: string | undefined;
  isSocketConnected: boolean;
  adapter: SocketAdapterInstance | null;
  newClientMessageId: () => string;
  newCorrelationId: () => string;
  rememberPendingSentMessage: (
    channelId: string,
    clientMessageId: string,
    authorId: string,
    replyTo?: ReplyTo,
  ) => void;
  addLocal: (msg: RawMessage) => void;
  uiTx: OutboundPollUiTransactionSink;
  reportPrimaryFlowFailure: (
    code: string,
    err: Error,
    extras?: Record<string, unknown>,
  ) => void;
  socketDiagInfo: (event: string, fields: Record<string, unknown>) => void;
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
}): void {
  if (opts.isSocketConnected) {
    opts.socketDiagInfo('sendMessage_poll_connected', {});
    if (!opts.adapter) {
      opts.reportPrimaryFlowFailure(
        'socket.sendMessage.missingAdapter',
        new Error('Socket adapter missing'),
        { channelId: opts.channelId },
      );
      throw new Error(
        'Realtime connection is not ready. Wait for Echo to reconnect, then try again.',
      );
    }
    const clientMessageId = opts.authorId
      ? opts.newClientMessageId()
      : undefined;
    if (opts.authorId && clientMessageId) {
      opts.uiTx.beginTransaction({
        id: clientMessageId,
        type: 'message-send',
        state: 'pending',
        channelId: opts.channelId,
        clientMessageId,
      });
      opts.addLocal({
        id: clientMessageId,
        authorId: opts.authorId,
        timestamp: new Date().toISOString(),
        content: opts.content.trim() || '',
        ...(opts.mentions?.length ? { mentions: opts.mentions } : {}),
        poll: opts.poll,
        replyTo: opts.replyTo,
        ...optimisticAuthorEchoPatch(opts.getLocalAuthorEcho),
      });
      opts.rememberPendingSentMessage(
        opts.channelId,
        clientMessageId,
        opts.authorId,
        opts.replyTo,
      );
    }
    try {
      opts.adapter.sendMessage({
        channelId: opts.channelId,
        content: opts.content.trim() || '',
        mentions: opts.mentions,
        authorId: opts.authorId,
        replyTo: opts.replyTo,
        ...(clientMessageId ? { id: clientMessageId } : {}),
        correlationId: opts.newCorrelationId(),
        poll: opts.poll,
      });
    } catch (e) {
      if (clientMessageId) opts.uiTx.rollbackTransaction(clientMessageId);
      throw e;
    }
    return;
  }
  if (opts.authorId) {
    opts.addLocal({
      id: opts.newClientMessageId(),
      authorId: opts.authorId,
      timestamp: new Date().toISOString(),
      content: opts.content.trim() || '',
      ...(opts.mentions?.length ? { mentions: opts.mentions } : {}),
      poll: opts.poll,
      replyTo: opts.replyTo,
      ...optimisticAuthorEchoPatch(opts.getLocalAuthorEcho),
    });
  }
}
