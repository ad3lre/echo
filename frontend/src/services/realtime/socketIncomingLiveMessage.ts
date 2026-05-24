import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import { socketDiagInfo } from '@/observability/socketDiagnostics';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import {
  type EchoRealtimeIncomingChatPayload,
  rawMessageFromEchoRealtimeIncomingPayload,
} from './socketIncomingRawMessage';

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
  socketDiagInfo('onMessage', {
    channelId: payload.channelId,
    id: payload.id,
    authorId: payload.authorId,
    contentPreview: payload.content?.slice(0, 40),
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
    contentPreview: plain.trim() || undefined,
  });
}
