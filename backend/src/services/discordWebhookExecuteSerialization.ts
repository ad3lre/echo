import type { EchoMessageRow } from '../domain/echoMessagesDal';
import type {
  DiscordAttachment,
  DiscordMessage,
  DiscordUser,
} from '../api/routes/discordApi/serializers';
import { serializeUser } from '../api/routes/discordApi/serializers';
import {
  DISCORD_MSG_FLAG_IS_COMPONENTS_V2,
  DISCORD_MSG_FLAG_SUPPRESS_EMBEDS,
} from './echoChannelWebhookExecuteConstants';

function webhookAuthor(row: EchoMessageRow): DiscordUser {
  const name =
    row.webhookUsername?.trim()?.slice(0, 80) ||
    row.authorDisplayName?.trim() ||
    'Webhook';
  const pfp = row.webhookAvatarUrl?.trim() || row.authorAvatar?.trim() || '';
  return serializeUser({
    id: row.sourceWebhookId ?? row.authorId,
    username: name,
    displayName: name,
    pfp: pfp || undefined,
    isBot: true,
  });
}

export function serializeEchoRowForDiscordWebhookExecuteWait(
  row: EchoMessageRow,
): DiscordMessage & { flags?: number; components?: unknown[] } {
  const author = webhookAuthor(row);
  const content = (row.searchIndexText ?? row.content ?? '').trim();
  const flags = row.messageFlags ?? 0;
  const suppressEmbeds = (flags & DISCORD_MSG_FLAG_SUPPRESS_EMBEDS) !== 0;
  const rawEmbeds = Array.isArray(row.embeds) ? row.embeds : [];
  const embedsOut = suppressEmbeds ? [] : rawEmbeds;

  const attachments: DiscordAttachment[] = (row.attachments ?? []).map(
    (att, idx) => ({
      id: String(idx),
      filename: att.filename ?? 'attachment',
      size: att.fileSize ?? 0,
      url: att.url,
      proxy_url: att.url,
      ...(att.mimeType ? { content_type: att.mimeType } : {}),
    }),
  );

  const mentionsEveryone =
    Array.isArray(row.mentions) &&
    row.mentions.some(
      (m) =>
        m &&
        typeof m === 'object' &&
        (m as { kind?: string }).kind === 'everyone',
    );

  const components =
    (flags & DISCORD_MSG_FLAG_IS_COMPONENTS_V2) !== 0 ||
    (Array.isArray(row.components) && row.components.length > 0)
      ? Array.isArray(row.components)
        ? row.components
        : undefined
      : undefined;

  return {
    id: row.id,
    channel_id: row.channelId,
    author,
    content,
    timestamp: row.timestamp,
    edited_timestamp: row.editedAt ?? null,
    tts: row.tts === true,
    mention_everyone: Boolean(mentionsEveryone),
    mentions: [],
    mention_roles: [],
    attachments,
    embeds: embedsOut,
    reactions: [],
    pinned: false,
    type: 0,
    ...(flags ? { flags } : {}),
    ...(components ? { components: components as unknown[] } : {}),
  };
}
