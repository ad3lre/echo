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
import type { E2eeOutboundEncryption } from '@/services/e2ee/e2eeTypes';

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
    preEncryptedE2ee?: E2eeOutboundEncryption,
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

    function emitOutboundChatPayload(
      wireContent: string,
      wireMentions: MentionEntity[] | undefined,
      wireReplyTo: ReplyTo | undefined,
      wireContentJson: unknown | undefined,
      wireContentSchemaVersion: number | undefined,
      wireEncryption: E2eeOutboundEncryption | undefined,
    ): void {
      emitOneOutboundChatPayload({
        channelId,
        authorId,
        wireContent,
        wireMentions,
        wireReplyTo,
        wireContentJson,
        wireContentSchemaVersion,
        wireEncryption,
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
      });
    }

    if (preEncryptedE2ee) {
      reportPrimaryFlowFailure(
        'e2ee.chat_removed',
        new Error('Encrypted chat messages are no longer supported.'),
        { channelId },
      );
      throw new Error(
        'Encrypted chat messages are no longer supported. Voice uses end-to-end encryption by default.',
      );
    }

    runChunkedOrSingleOutboundChatSend({
      content,
      mentions,
      replyTo,
      mayChunkPlainText: !hasMedia && !forwardMessageId,
      contentJson,
      contentSchemaVersion,
      emit: (w) =>
        emitOutboundChatPayload(
          w.wireContent,
          w.wireMentions,
          w.wireReplyTo,
          w.wireContentJson,
          w.wireContentSchemaVersion,
          undefined,
        ),
    });
  };
}
