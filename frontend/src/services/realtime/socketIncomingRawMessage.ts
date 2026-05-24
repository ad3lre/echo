import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type {
  Embed,
  ForwardedFrom,
  MentionEntity,
  Message,
  MessageAttachmentPayload,
  MessageStickerPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import { toStoredMessageTimestamp } from '@/utils/storedMessageTimestamp';

/** Normalized chat fields shared by realtime `message` events and `message:ack` payloads. */
export type SocketChatFieldsForRaw = {
  id: string;
  authorId: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  authorDiscordUserId?: string;
  bridgeFromDiscord?: boolean;
  content: string;
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  mentions?: MentionEntity[];
  timestamp: string;
  replyTo?: ReplyTo;
  forwardedFrom?: ForwardedFrom;
  editedAt?: string;
  embeds?: Embed[];
  imageUrl?: string;
  videoUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  poll?: PollData;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  encryption?: Message['encryption'];
};

export function rawMessageFromSocketChatFields(
  fields: SocketChatFieldsForRaw,
): RawMessage {
  const mf = fields.messageFormatVersion ?? 1;
  const cs = fields.contentSchemaVersion ?? 1;
  const plain = fields.contentText ?? fields.content;
  const isE2ee = !!fields.encryption;
  return {
    id: fields.id,
    authorId: fields.authorId,
    ...(typeof fields.authorDisplayName === 'string' &&
    fields.authorDisplayName.trim()
      ? { authorDisplayName: fields.authorDisplayName.trim() }
      : {}),
    ...(typeof fields.authorAvatar === 'string' && fields.authorAvatar.trim()
      ? { authorAvatar: fields.authorAvatar.trim() }
      : {}),
    ...(fields.authorIsDiscordShadow === true
      ? { authorIsDiscordShadow: true }
      : {}),
    ...(typeof fields.authorDiscordUserId === 'string' &&
    fields.authorDiscordUserId.trim()
      ? { authorDiscordUserId: fields.authorDiscordUserId.trim() }
      : {}),
    ...(fields.bridgeFromDiscord === true ? { bridgeFromDiscord: true } : {}),
    timestamp: toStoredMessageTimestamp(fields.timestamp),
    content: isE2ee && !plain.trim() ? '[Encrypted message]' : plain,
    ...(fields.contentText !== undefined
      ? { contentText: fields.contentText }
      : {}),
    ...(mf >= 2 && fields.contentJson !== undefined
      ? { contentJson: fields.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(fields.mentions?.length ? { mentions: fields.mentions } : {}),
    ...(fields.replyTo ? { replyTo: fields.replyTo } : {}),
    ...(fields.forwardedFrom ? { forwardedFrom: fields.forwardedFrom } : {}),
    ...(fields.editedAt
      ? { editedAt: toStoredMessageTimestamp(fields.editedAt) }
      : {}),
    ...(fields.embeds?.length ? { embeds: fields.embeds } : {}),
    ...(fields.imageUrl ? { imageUrl: fields.imageUrl } : {}),
    ...(fields.videoUrl ? { videoUrl: fields.videoUrl } : {}),
    ...(fields.gif ? { gif: true } : {}),
    ...(fields.imageSpoiler ? { imageSpoiler: true } : {}),
    ...(fields.poll ? { poll: fields.poll } : {}),
    ...(fields.attachments?.length ? { attachments: fields.attachments } : {}),
    ...(fields.stickers?.length ? { stickers: fields.stickers } : {}),
    ...(fields.encryption ? { encryption: fields.encryption } : {}),
  };
}

/** Inbound `message` socket event (before author id resolution from pending sends). */
export type EchoRealtimeIncomingChatPayload = {
  id: string;
  channelId: string;
  authorId: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  authorDiscordUserId?: string;
  bridgeFromDiscord?: boolean;
  content: string;
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  mentions?: MentionEntity[];
  timestamp: string;
  replyTo?: ReplyTo;
  forwardedFrom?: ForwardedFrom;
  embeds?: Embed[];
  imageUrl?: string;
  videoUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  poll?: PollData;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  encryption?: Message['encryption'];
};

export function rawMessageFromEchoRealtimeIncomingPayload(
  payload: EchoRealtimeIncomingChatPayload,
  resolvedAuthorId: string,
): RawMessage {
  return rawMessageFromSocketChatFields({
    id: payload.id,
    authorId: resolvedAuthorId,
    authorDisplayName: payload.authorDisplayName,
    authorAvatar: payload.authorAvatar,
    authorIsDiscordShadow: payload.authorIsDiscordShadow,
    authorDiscordUserId: payload.authorDiscordUserId,
    bridgeFromDiscord: payload.bridgeFromDiscord,
    content: payload.content,
    contentText: payload.contentText,
    contentJson: payload.contentJson,
    messageFormatVersion: payload.messageFormatVersion,
    contentSchemaVersion: payload.contentSchemaVersion,
    mentions: payload.mentions,
    timestamp: payload.timestamp,
    replyTo: payload.replyTo,
    forwardedFrom: payload.forwardedFrom,
    embeds: payload.embeds,
    imageUrl: payload.imageUrl,
    videoUrl: payload.videoUrl,
    gif: payload.gif,
    imageSpoiler: payload.imageSpoiler,
    poll: payload.poll,
    attachments: payload.attachments,
    stickers: payload.stickers,
    encryption: payload.encryption,
  });
}

/** Server `message` row from `message:ack` (same RawMessage shape as inbound events). */
export function rawMessageFromEchoAckMessage(m: Message): RawMessage {
  return rawMessageFromSocketChatFields({
    id: m.id,
    authorId: m.authorId,
    authorDisplayName: m.authorDisplayName,
    authorAvatar: m.authorAvatar,
    authorIsDiscordShadow: m.authorIsDiscordShadow,
    authorDiscordUserId: m.authorDiscordUserId,
    bridgeFromDiscord: m.bridgeFromDiscord,
    content: m.content,
    contentText: m.contentText,
    contentJson: m.contentJson,
    messageFormatVersion: m.messageFormatVersion,
    contentSchemaVersion: m.contentSchemaVersion,
    mentions: m.mentions,
    timestamp: m.timestamp,
    replyTo: m.replyTo,
    editedAt: m.editedAt,
    embeds: m.embeds,
    imageUrl: m.imageUrl,
    videoUrl: m.videoUrl,
    gif: m.gif,
    imageSpoiler: m.imageSpoiler,
    poll: m.poll,
    attachments: m.attachments,
    stickers: m.stickers,
    encryption: m.encryption,
  });
}
