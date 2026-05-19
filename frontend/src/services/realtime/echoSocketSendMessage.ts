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
import { readCachedE2eeThreadState } from '@/services/e2ee/e2eeThreadStateCache';
import { getOrCreateLocalE2eeDevice } from '@/services/e2ee/e2eeDeviceStore';
import { e2eeEncryptDmPlaintext } from '@/services/e2ee/e2eeMessageCrypto';
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

    const e2eeState = readCachedE2eeThreadState(channelId);
    const e2eeEnabled = e2eeState?.enabled === true;

    if (preEncryptedE2ee && e2eeEnabled) {
      emitOutboundChatPayload(
        '',
        undefined,
        replyTo,
        undefined,
        undefined,
        preEncryptedE2ee,
      );
      return;
    }

    if (e2eeEnabled) {
      if (hasMedia) {
        reportPrimaryFlowFailure(
          'e2ee.media_not_supported',
          new Error(
            'Images, video, GIFs, and file attachments are not supported in encrypted DMs yet.',
          ),
          { channelId },
        );
        throw new Error(
          'This encrypted conversation only supports plain text for now. Remove media and try again.',
        );
      }
      void (async () => {
        try {
          const uid = opts.getAuthorId()?.trim();
          if (!uid) throw new Error('Missing author id for E2EE');
          const peerUserId = opts.getDmPeerUserId?.(channelId)?.trim();
          if (!peerUserId) {
            reportPrimaryFlowFailure(
              'e2ee.peer_missing',
              new Error('Direct DM peer is required for E2EE in this build'),
              { channelId },
            );
            return;
          }
          const dev = await getOrCreateLocalE2eeDevice(
            uid,
            opts.getAccessToken?.(),
          );
          const enc = await e2eeEncryptDmPlaintext({
            viewerUserId: uid,
            peerUserId,
            plaintext: content,
            senderDeviceId: dev.deviceId,
            authToken: opts.getAccessToken?.(),
          });
          emitOutboundChatPayload(
            '',
            undefined,
            replyTo,
            undefined,
            undefined,
            enc,
          );
        } catch (e) {
          reportPrimaryFlowFailure(
            'e2ee.encrypt_failed',
            e instanceof Error ? e : new Error(String(e)),
            { channelId },
          );
          throw e;
        }
      })();
      return;
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
