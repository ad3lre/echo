import { toRaw } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';

function tryJsonDeepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function tryJsonCloneUnknown(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Detaches a {@link RawMessage} from the reactive graph for UI transaction storage.
 * `structuredClone` throws on Vue proxies and on some nested values TipTap/editor code
 * may hang off `contentJson`.
 */
function cloneRawMessageLooseFallback(raw: RawMessage): RawMessage {
  return {
    id: raw.id,
    authorId: raw.authorId,
    systemMessage: raw.systemMessage,
    authorDisplayName: raw.authorDisplayName,
    authorAvatar: raw.authorAvatar,
    authorIsDiscordShadow: raw.authorIsDiscordShadow,
    authorDiscordUserId: raw.authorDiscordUserId,
    bridgeFromDiscord: raw.bridgeFromDiscord,
    timestamp: raw.timestamp,
    content: raw.content,
    contentText: raw.contentText,
    contentJson:
      raw.contentJson !== undefined
        ? tryJsonCloneUnknown(raw.contentJson)
        : undefined,
    messageFormatVersion: raw.messageFormatVersion,
    contentSchemaVersion: raw.contentSchemaVersion,
    mentions: raw.mentions?.map((mention) => ({ ...mention })),
    gif: raw.gif,
    imageUrl: raw.imageUrl,
    imageSpoiler: raw.imageSpoiler,
    videoUrl: raw.videoUrl,
    audioUrl: raw.audioUrl,
    attachments: raw.attachments?.map((a) => ({ ...a })),
    stickers: raw.stickers?.map((s) => ({ ...s })),
    poll:
      raw.poll !== undefined
        ? (tryJsonCloneUnknown(raw.poll) as RawMessage['poll'])
        : undefined,
    replyTo:
      raw.replyTo !== undefined
        ? (tryJsonCloneUnknown(raw.replyTo) as RawMessage['replyTo'])
        : undefined,
    forwardedFrom:
      raw.forwardedFrom !== undefined
        ? (tryJsonCloneUnknown(
            raw.forwardedFrom,
          ) as RawMessage['forwardedFrom'])
        : undefined,
    editedAt: raw.editedAt,
    reactions: raw.reactions?.map((reaction) => ({
      ...reaction,
      userIds: [...reaction.userIds],
    })),
    embeds: raw.embeds?.map((embed) => ({ ...embed })),
  };
}

export function cloneRawMessageForUiTransaction(msg: RawMessage): RawMessage {
  const raw = toRaw(msg);
  try {
    return tryJsonDeepClone(raw);
  } catch {
    return cloneRawMessageLooseFallback(raw);
  }
}
