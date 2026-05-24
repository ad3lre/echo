import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  socketDiagError,
  socketDiagInfo,
  socketDiagWarn,
} from '@/observability/socketDiagnostics';
import type { EchoSocketAdapter } from '@/services/adapters/socketAdapter';
import type { EchoRealtimePort } from '@/services/realtime/echoRealtimePort';
import {
  newClientMessageId,
  newCorrelationId,
  type LocalAuthorEchoSnapshot,
} from '@/services/realtime/socketOutbound';
import { runChunkedOrSingleOutboundChatSend } from '@/services/realtime/socketOutboundChunkedChatSend';
import { sendOutboundPollMessage } from '@/services/realtime/socketOutboundPollSend';
import { sendOneOutboundChatMessage as emitOneOutboundChatPayload } from '@/services/realtime/socketOutboundChatSend';
import { assertOutboundSendSocketReady } from '@/services/realtime/socketOutboundSendPreflight';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import type {
  ForwardedFrom,
  MentionEntity,
  MessageAttachmentPayload,
  PollData,
  ReplyTo,
} from '@shared/types';

export function createEchoSocketSendMessage(opts: {
  getAuthorId: () => string | undefined;
  socketOff: () => boolean;
  isSocketConnected: () => boolean;
  getAdapter: () => EchoSocketAdapter | null;
  appendChannelMessage: (channelId: string, msg: RawMessage) => void;
  rememberPendingSentMessage: (
    channelId: string,
    clientMessageId: string,
    authorId: string,
    replyTo?: ReplyTo,
  ) => void;
  uiTx: UiTransactionManager;
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
  getDmPeerUserId?: (channelId: string) => string | undefined;
  getAccessToken?: () => string | null | undefined;
}): EchoRealtimePort['sendMessage'] {
  return function sendMessage(
    channelId: string,
    content: string,
    mentions?: MentionEntity[],
    imageUrl?: string,
    poll?: PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: MessageAttachmentPayload[],
    contentJson?: unknown,
    contentSchemaVersion?: number,
    forwardMessageId?: string,
    forwardPreview?: ForwardedFrom,
  ): void {
    const authorId = opts.getAuthorId();
    const addLocal = (msg: RawMessage) => {
      opts.appendChannelMessage(channelId, msg);
    };
    const liveSocketExpected = !opts.socketOff();
    assertOutboundSendSocketReady({
      channelId,
      contentPreviewSource: content,
      liveSocketExpected,
      isSocketConnected: opts.isSocketConnected(),
      reportPrimaryFlowFailure,
      socketDiagInfo,
      socketDiagWarn,
    });
    if (poll) {
      sendOutboundPollMessage({
        channelId,
        content,
        mentions,
        replyTo,
        poll,
        authorId,
        isSocketConnected: opts.isSocketConnected(),
        adapter: opts.getAdapter(),
        newClientMessageId,
        newCorrelationId,
        rememberPendingSentMessage: opts.rememberPendingSentMessage,
        addLocal,
        uiTx: opts.uiTx,
        reportPrimaryFlowFailure,
        socketDiagInfo,
        getLocalAuthorEcho: opts.getLocalAuthorEcho,
      });
      return;
    }

    const hasMedia = !!(
      imageUrl ||
      videoUrl ||
      gif ||
      (attachments && attachments.length > 0)
    );

    runChunkedOrSingleOutboundChatSend({
      content,
      mentions,
      replyTo,
      mayChunkPlainText: !hasMedia && !forwardMessageId,
      contentJson,
      contentSchemaVersion,
      emit: (w) =>
        emitOneOutboundChatPayload({
          channelId,
          authorId,
          wireContent: w.wireContent,
          wireMentions: w.wireMentions,
          wireReplyTo: w.wireReplyTo,
          wireContentJson: w.wireContentJson,
          wireContentSchemaVersion: w.wireContentSchemaVersion,
          imageUrl,
          videoUrl,
          gif,
          imageSpoiler,
          attachments,
          forwardMessageId,
          forwardPreview,
          isSocketConnected: opts.isSocketConnected(),
          adapter: opts.getAdapter(),
          newClientMessageId,
          newCorrelationId,
          rememberPendingSentMessage: opts.rememberPendingSentMessage,
          addLocal,
          uiTx: opts.uiTx,
          reportPrimaryFlowFailure,
          socketDiagInfo,
          socketDiagError,
          getLocalAuthorEcho: opts.getLocalAuthorEcho,
        }),
    });
  };
}
