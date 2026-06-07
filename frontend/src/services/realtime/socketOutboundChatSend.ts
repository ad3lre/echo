import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { ECHO_CONTENT_SCHEMA_VERSION } from '@shared/echoMessageFormatV2';
import type {
  ForwardedFrom,
  MentionEntity,
  MessageAttachmentPayload,
  MessageStickerPayload,
  ReplyTo,
} from '@shared/types';
import {
  optimisticAuthorEchoPatch,
  type LocalAuthorEchoSnapshot,
  type SocketAdapterInstance,
} from './socketOutbound';
import type { OutboundPollUiTransactionSink } from './socketOutboundPollSend';
import { recordEmittedAttachmentUrls } from './attachmentSendDiag';

/**
 * One logical outbound chat send (plain, rich JSON, media, forward metadata) from `useSocket`
 * `sendMessage`, after optional plain-text chunking — optimistic UI when connected + author,
 * adapter wire payload, offline local-only append.
 */
export function sendOneOutboundChatMessage(opts: {
  channelId: string;
  authorId: string | undefined;
  wireContent: string;
  wireMentions?: MentionEntity[];
  wireReplyTo?: ReplyTo;
  wireContentJson?: unknown;
  wireContentSchemaVersion?: number;
  imageUrl?: string;
  videoUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  attachments?: MessageAttachmentPayload[];
  forwardMessageId?: string;
  forwardPreview?: ForwardedFrom;
  stickerIds?: string[];
  optimisticStickers?: MessageStickerPayload[];
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
  socketDiagError: (event: string, fields: Record<string, unknown>) => void;
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
}): void {
  const wireForwardId = opts.forwardMessageId;
  const wireForwardPreview = opts.forwardPreview;
  const wireHasMedia = !!(
    opts.imageUrl ||
    opts.videoUrl ||
    opts.gif ||
    (opts.attachments && opts.attachments.length > 0) ||
    (opts.stickerIds && opts.stickerIds.length > 0)
  );
  const useJsonBody =
    !wireHasMedia &&
    opts.wireContentJson !== undefined &&
    opts.wireContentJson !== null &&
    typeof opts.wireContentJson === 'object';
  const csVer = opts.wireContentSchemaVersion ?? ECHO_CONTENT_SCHEMA_VERSION;

  if (opts.isSocketConnected) {
    opts.socketDiagInfo('sendMessage_standard_connected', {
      adapterPresent: !!opts.adapter,
    });
    if (!opts.adapter) {
      opts.socketDiagError('sendMessage_missing_adapter', {
        channelId: opts.channelId,
      });
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
        content: wireHasMedia ? opts.wireContent || '' : opts.wireContent,
        ...(useJsonBody
          ? {
              messageFormatVersion: 2,
              contentSchemaVersion: csVer,
              contentJson: opts.wireContentJson,
              contentText: opts.wireContent,
            }
          : {}),
        ...(opts.wireMentions?.length ? { mentions: opts.wireMentions } : {}),
        ...(opts.wireReplyTo ? { replyTo: opts.wireReplyTo } : {}),
        ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
        ...(opts.videoUrl ? { videoUrl: opts.videoUrl } : {}),
        ...(opts.gif ? { gif: true } : {}),
        ...(opts.imageSpoiler ? { imageSpoiler: true } : {}),
        ...(opts.attachments && opts.attachments.length
          ? { attachments: opts.attachments }
          : {}),
        ...(opts.optimisticStickers?.length
          ? { stickers: opts.optimisticStickers }
          : {}),
        ...(wireForwardPreview ? { forwardedFrom: wireForwardPreview } : {}),
        ...optimisticAuthorEchoPatch(opts.getLocalAuthorEcho),
      });
      opts.rememberPendingSentMessage(
        opts.channelId,
        clientMessageId,
        opts.authorId,
        opts.wireReplyTo,
      );
    }
    opts.socketDiagInfo('emitting_message', {
      channelId: opts.channelId,
      clientMessageId,
      contentPreview: `${opts.wireContent.substring(0, 20)}…`,
    });
    if (opts.attachments && opts.attachments.length) {
      recordEmittedAttachmentUrls(opts.attachments.map((a) => a.url));
    }
    try {
      opts.adapter.sendMessage({
        channelId: opts.channelId,
        content: wireHasMedia ? opts.wireContent || '' : opts.wireContent,
        mentions: opts.wireMentions,
        authorId: opts.authorId,
        replyTo: opts.wireReplyTo,
        ...(clientMessageId ? { id: clientMessageId } : {}),
        correlationId: opts.newCorrelationId(),
        ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
        ...(opts.videoUrl ? { videoUrl: opts.videoUrl } : {}),
        ...(opts.gif ? { gif: true } : {}),
        ...(opts.imageSpoiler ? { imageSpoiler: true } : {}),
        ...(opts.attachments && opts.attachments.length
          ? { attachments: opts.attachments }
          : {}),
        ...(opts.stickerIds && opts.stickerIds.length
          ? { stickerIds: opts.stickerIds }
          : {}),
        ...(useJsonBody
          ? {
              contentJson: opts.wireContentJson,
              contentSchemaVersion: csVer,
            }
          : {}),
        ...(wireForwardId ? { forwardMessageId: wireForwardId } : {}),
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
      content: wireHasMedia ? opts.wireContent || '' : opts.wireContent,
      ...(useJsonBody
        ? {
            messageFormatVersion: 2,
            contentSchemaVersion: csVer,
            contentJson: opts.wireContentJson,
            contentText: opts.wireContent,
          }
        : {}),
      ...(opts.wireMentions?.length ? { mentions: opts.wireMentions } : {}),
      replyTo: opts.wireReplyTo,
      ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
      ...(opts.videoUrl ? { videoUrl: opts.videoUrl } : {}),
      ...(opts.gif ? { gif: true } : {}),
      ...(opts.imageSpoiler ? { imageSpoiler: true } : {}),
      ...(opts.attachments && opts.attachments.length
        ? { attachments: opts.attachments }
        : {}),
      ...(opts.optimisticStickers?.length
        ? { stickers: opts.optimisticStickers }
        : {}),
      ...(opts.forwardPreview ? { forwardedFrom: opts.forwardPreview } : {}),
      ...optimisticAuthorEchoPatch(opts.getLocalAuthorEcho),
    });
  }
}
