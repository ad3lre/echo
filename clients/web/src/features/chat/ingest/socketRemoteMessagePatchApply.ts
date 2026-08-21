import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import { socketDiagWarn } from '@/observability/socketDiagnostics';
import { toStoredMessageTimestamp } from '@/features/layout/echoWorkspace/storedMessageTimestamp';
import type {
  Embed,
  ForwardedFrom,
  MentionEntity,
  MessageAttachmentPayload,
  MessageReaction,
  MessageStickerPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import { mergeFanoutMessageReactions } from '@shared/messageReactionsWire';
import { sortMessageReactionsForDisplay } from '@shared/types';

/** Read channel list, mutate index, then materialize bucket via sink (index is canonical). */
export type ChannelMessagesIndexSink = {
  getChannelList: (channelId: string) => RawMessage[] | undefined;
  /** Flush `messages[channelId]` from the index after in-place index mutations. */
  materializeChannelAfterIndexMutation: (channelId: string) => void;
};

export type RemoteMessageEditPayload = {
  channelId: string;
  messageId: string;
  content: string;
  contentText?: string;
  editedAt: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  mentions?: MentionEntity[];
  attachments?: MessageAttachmentPayload[];
  components?: unknown;
};

export function applyRemoteMessageEdit(
  p: RemoteMessageEditPayload,
  sink: ChannelMessagesIndexSink & {
    onAfterEdit?: (channelId: string, messageId: string) => void;
  },
): void {
  const list = sink.getChannelList(p.channelId);
  if (!list?.length) return;
  const index = getChannelIndex(p.channelId, list);
  const prev = index.byId.get(p.messageId);
  if (!prev) return;
  const plain = p.contentText ?? p.content;
  const mf = p.messageFormatVersion ?? prev.messageFormatVersion ?? 1;
  const cs = p.contentSchemaVersion ?? prev.contentSchemaVersion ?? 1;
  index.update(p.messageId, {
    content: plain,
    contentText: p.contentText !== undefined ? p.contentText : plain,
    editedAt: toStoredMessageTimestamp(p.editedAt),
    embeds: [],
    ...(mf >= 2 && p.contentJson !== undefined
      ? { contentJson: p.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(p.mentions !== undefined ? { mentions: p.mentions } : {}),
    ...(p.attachments !== undefined ? { attachments: p.attachments } : {}),
    ...(p.components !== undefined ? { components: p.components } : {}),
  });
  sink.materializeChannelAfterIndexMutation(p.channelId);
  sink.onAfterEdit?.(p.channelId, p.messageId);
}

export type RemoteMessageEmbedsPayload = {
  channelId: string;
  messageId: string;
  embeds: Embed[];
};

export function applyRemoteMessageEmbeds(
  p: RemoteMessageEmbedsPayload,
  sink: ChannelMessagesIndexSink,
): void {
  const list = sink.getChannelList(p.channelId);
  if (!list?.length) return;
  const index = getChannelIndex(p.channelId, list);
  if (!index.byId.has(p.messageId)) return;
  index.update(p.messageId, { embeds: p.embeds ?? [] });
  sink.materializeChannelAfterIndexMutation(p.channelId);
}

/** Server rewrote Discord CDN URLs to Echo-hosted URLs (import mirror); does not clear embeds. */
export type RemoteMessageMediaMirrorPayload = {
  channelId: string;
  messageId: string;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  embeds?: Embed[];
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  forwardedFrom?: ForwardedFrom;
  replyTo?: ReplyTo;
};

export function applyRemoteMessageMediaMirror(
  p: RemoteMessageMediaMirrorPayload,
  sink: ChannelMessagesIndexSink,
): void {
  const list = sink.getChannelList(p.channelId);
  if (!list?.length) return;
  const index = getChannelIndex(p.channelId, list);
  if (!index.byId.has(p.messageId)) return;
  index.update(p.messageId, {
    ...(p.attachments !== undefined ? { attachments: p.attachments } : {}),
    ...(p.stickers !== undefined ? { stickers: p.stickers } : {}),
    ...(p.embeds !== undefined ? { embeds: p.embeds } : {}),
    ...(p.imageUrl !== undefined ? { imageUrl: p.imageUrl } : {}),
    ...(p.videoUrl !== undefined ? { videoUrl: p.videoUrl } : {}),
    ...(p.audioUrl !== undefined ? { audioUrl: p.audioUrl } : {}),
    ...(p.forwardedFrom !== undefined
      ? { forwardedFrom: p.forwardedFrom }
      : {}),
    ...(p.replyTo !== undefined ? { replyTo: p.replyTo } : {}),
  });
  sink.materializeChannelAfterIndexMutation(p.channelId);
}

export type RemoteMessageReactionsPayload = {
  channelId: string;
  messageId: string;
  reactions: MessageReaction[];
};

export function applyRemoteMessageReactions(
  p: RemoteMessageReactionsPayload,
  sink: ChannelMessagesIndexSink & {
    onAfterReactions?: (channelId: string, messageId: string) => void;
    viewerUserId?: string;
  },
): void {
  const list = sink.getChannelList(p.channelId);
  if (!list?.length) {
    socketDiagWarn('applyRemoteMessageReactions', {
      reason: 'empty_or_missing_channel_bucket',
      channelId: p.channelId,
      messageId: p.messageId,
      reactionCount: p.reactions.length,
    });
    return;
  }
  const index = getChannelIndex(p.channelId, list);
  if (!index.byId.has(p.messageId)) {
    socketDiagWarn('applyRemoteMessageReactions', {
      reason: 'message_not_in_client_index',
      channelId: p.channelId,
      messageId: p.messageId,
      reactionCount: p.reactions.length,
      bucketSize: list.length,
    });
    return;
  }
  const merged = mergeFanoutMessageReactions(
    index.byId.get(p.messageId)?.reactions,
    p.reactions,
    sink.viewerUserId,
  );
  const reactionsOrdered =
    merged.length > 0
      ? (sortMessageReactionsForDisplay(merged) ?? merged)
      : undefined;
  index.update(p.messageId, {
    reactions: reactionsOrdered,
  });
  sink.materializeChannelAfterIndexMutation(p.channelId);
  sink.onAfterReactions?.(p.channelId, p.messageId);
}

export type RemotePollUpdatePayload = {
  channelId: string;
  messageId: string;
  poll: PollData;
};

export function applyRemotePollUpdate(
  p: RemotePollUpdatePayload,
  sink: ChannelMessagesIndexSink,
): void {
  const list = sink.getChannelList(p.channelId);
  if (!list?.length) return;
  const index = getChannelIndex(p.channelId, list);
  if (!index.byId.has(p.messageId)) return;
  index.update(p.messageId, { poll: p.poll });
  sink.materializeChannelAfterIndexMutation(p.channelId);
}
