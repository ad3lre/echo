import type { EchoApiMessage } from '@/api/echo/messages';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { toStoredMessageTimestamp } from '@/utils/storedMessageTimestamp';
import { plainTextForEchoApiMessage } from '@/services/domain/messageDisplayPlain';

export function mapEchoMessageToRaw(m: EchoApiMessage): RawMessage {
  const embeds = Array.isArray(m.embeds)
    ? (m.embeds as RawMessage['embeds'])
    : undefined;
  const mf = m.messageFormatVersion ?? 1;
  const cs = m.contentSchemaVersion ?? 1;
  const plain = plainTextForEchoApiMessage(m);
  return {
    id: m.id,
    authorId: m.authorId,
    ...(typeof m.authorDisplayName === 'string' && m.authorDisplayName.trim()
      ? { authorDisplayName: m.authorDisplayName.trim() }
      : {}),
    ...(typeof m.authorAvatar === 'string' && m.authorAvatar.trim()
      ? { authorAvatar: m.authorAvatar.trim() }
      : {}),
    ...(m.authorIsDiscordShadow === true
      ? { authorIsDiscordShadow: true }
      : {}),
    ...(typeof m.authorDiscordUserId === 'string' &&
    m.authorDiscordUserId.trim()
      ? { authorDiscordUserId: m.authorDiscordUserId.trim() }
      : {}),
    ...(m.bridgeFromDiscord === true ? { bridgeFromDiscord: true } : {}),
    timestamp: toStoredMessageTimestamp(m.timestamp),
    content: plain,
    ...(plain ? { contentText: plain } : {}),
    ...(mf >= 2 && m.contentJson !== undefined
      ? { contentJson: m.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(m.mentions && Array.isArray(m.mentions)
      ? { mentions: m.mentions as RawMessage['mentions'] }
      : {}),
    ...(m.replyTo && typeof m.replyTo === 'object'
      ? { replyTo: m.replyTo as RawMessage['replyTo'] }
      : {}),
    ...(m.forwardedFrom &&
    typeof m.forwardedFrom === 'object' &&
    typeof (m.forwardedFrom as { messageId?: unknown }).messageId === 'string'
      ? {
          forwardedFrom: m.forwardedFrom as NonNullable<
            RawMessage['forwardedFrom']
          >,
        }
      : {}),
    ...(m.editedAt ? { editedAt: toStoredMessageTimestamp(m.editedAt) } : {}),
    ...(embeds?.length ? { embeds } : {}),
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
    ...(m.videoUrl ? { videoUrl: m.videoUrl } : {}),
    ...(m.audioUrl ? { audioUrl: m.audioUrl } : {}),
    ...(m.gif ? { gif: true } : {}),
    ...(m.imageSpoiler ? { imageSpoiler: true } : {}),
    ...(m.poll && typeof m.poll === 'object'
      ? { poll: m.poll as RawMessage['poll'] }
      : {}),
    ...(m.attachments?.length ? { attachments: m.attachments } : {}),
    ...(m.stickers?.length ? { stickers: m.stickers } : {}),
    ...(m.reactions?.length
      ? { reactions: m.reactions as RawMessage['reactions'] }
      : {}),
  };
}

export function dedupeRawMessagesById(msgs: RawMessage[]): RawMessage[] {
  const seen = new Set<string>();
  const out: RawMessage[] = [];
  for (const m of msgs) {
    const id = m.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

export function mapEchoMessagesToRaw(msgs: EchoApiMessage[]): RawMessage[] {
  return dedupeRawMessagesById(msgs.map(mapEchoMessageToRaw));
}
