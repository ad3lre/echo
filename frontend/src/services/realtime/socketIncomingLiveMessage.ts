import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import { socketDiagInfo } from '@/observability/socketDiagnostics';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import {
  type EchoRealtimeIncomingChatPayload,
  rawMessageFromEchoRealtimeIncomingPayload,
} from './socketIncomingRawMessage';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { e2eeDecryptIncomingDm } from '@/services/e2ee/e2eeMessageCrypto';

export type IngestEchoRealtimeIncomingChatSink = {
  ensureChannelMessagesList: (channelId: string) => RawMessage[];
  onDuplicateById: (channelId: string, messageId: string) => void;
  resolveAuthorId: (payload: EchoRealtimeIncomingChatPayload) => string;
  appendChannelMessage: (channelId: string, raw: RawMessage) => void;
  notifyIncomingChatMessage: (detail: IncomingChatMessageNotifyDetail) => void;
  applyAuthorHint?: (payload: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  }) => void;
  getViewerUserId?: () => string | undefined;
  /**
   * Inbound replies whose `replyTo.messageId` isn't yet in the channel's bucket
   * leave the reply preview unresolved and hide the original bubble — common when
   * the receiver missed the realtime broadcast for the original (e.g. socket
   * reconnect window, channel-room join lag). Hook lets the app shell trigger a
   * one-shot fetch so the original materializes without the user clicking.
   */
  ensureReplyTargetMessage?: (channelId: string, messageId: string) => void;
};

/** Inbound `message` / DM activity: dedupe, map to `RawMessage`, append, notify UI/sound. */
export function ingestEchoRealtimeIncomingChatMessage(
  payload: EchoRealtimeIncomingChatPayload,
  sink: IngestEchoRealtimeIncomingChatSink,
): void {
  const e2eeRedacted = !!payload.encryption;
  socketDiagInfo('onMessage', {
    channelId: payload.channelId,
    id: payload.id,
    authorId: payload.authorId,
    ...(e2eeRedacted
      ? { contentPreview: '[e2ee]' as const }
      : { contentPreview: payload.content?.slice(0, 40) }),
    hasMentions: !!payload.mentions?.length,
    hasReplyTo: !!payload.replyTo,
    hasPoll: !!payload.poll,
    attachments: payload.attachments?.length ?? 0,
  });
  const channelId = payload.channelId;
  const channelMessages = sink.ensureChannelMessagesList(channelId);
  const dupCheckIndex = getChannelIndex(channelId, channelMessages);
  if (dupCheckIndex.byId.has(payload.id)) {
    sink.onDuplicateById(channelId, payload.id);
    return;
  }
  const resolvedAuthorId = sink.resolveAuthorId(payload);
  const raw = rawMessageFromEchoRealtimeIncomingPayload(
    payload,
    resolvedAuthorId,
  );
  sink.applyAuthorHint?.({
    userId: resolvedAuthorId,
    displayName: payload.authorDisplayName,
    avatarUrl: payload.authorAvatar,
  });
  sink.appendChannelMessage(channelId, raw);
  const replyTargetId = payload.replyTo?.messageId?.trim();
  if (
    replyTargetId &&
    sink.ensureReplyTargetMessage &&
    !dupCheckIndex.byId.has(replyTargetId)
  ) {
    sink.ensureReplyTargetMessage(channelId, replyTargetId);
  }
  if (payload.encryption && raw.id) {
    const enc = payload.encryption;
    void (async () => {
      try {
        const viewer = sink.getViewerUserId?.()?.trim();
        if (!viewer) return;
        const decrypted = await e2eeDecryptIncomingDm({
          viewerUserId: viewer,
          authorUserId: resolvedAuthorId,
          channelId,
          envelope: enc.envelope,
          ciphertext: enc.ciphertext,
        });
        updateChannelMessageInBucket(channelId, raw.id!, {
          content: decrypted,
          contentText: decrypted,
        });
      } catch {
        // Keep placeholder content if decryption fails.
      }
    })();
  }
  const plain =
    (typeof payload.contentText === 'string' && payload.contentText.trim()
      ? payload.contentText
      : payload.content) ?? '';
  sink.notifyIncomingChatMessage({
    channelId,
    authorId: resolvedAuthorId,
    mentions: payload.mentions,
    replyTo: payload.replyTo,
    authorDisplayName: payload.authorDisplayName,
    authorAvatar: payload.authorAvatar,
    contentPreview: e2eeRedacted ? '[e2ee]' : plain.trim() || undefined,
  });
}
