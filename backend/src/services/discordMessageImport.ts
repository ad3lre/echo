import type { Pool } from 'pg';
import { DISCORD_BOT_INTERNAL_FETCH_MS } from '../constants/outboundHttp';
import { config } from '../config';
import {
  countEchoMessagesInChannel,
  insertEchoMessage,
  updateEchoMessageCreatedAtById,
} from '../domain/echoMessagesDal';
import {
  pickDiscordIconUrl,
  pickDiscordUrlOrProxy,
} from '../domain/discordCdnUrls';
import type { DiscordAuthorLike } from '../domain/discordImportUsers';
import { ensureEchoUserForDiscordMember } from '../domain/discordImportUsers';
import { getDiscordImportState } from './discordImport';
import type {
  Embed,
  ForwardedFrom,
  MessageAttachmentPayload,
  MessageStickerPayload,
} from '../../../shared/types';
import { sanitizePollForStorage } from '../sockets/messageValidation';
import {
  maybeEnqueueDiscordImportMediaMirror,
} from './discordImportMediaMirrorQueue';
import { resolveDiscordSyncedContentMentions } from './translateDiscordSyncedMentions';
import { filterMentionsForChannelContext } from '../domain/echoStore/mentionContext';

export type DiscordImportMessagesOptions = {
  limit?: number;
};

export type DiscordImportMessagesResult = {
  importedCount: number;
};

type BotFetchedMessage = {
  id?: unknown;
  content?: unknown;
  timestamp?: unknown;
  author?: unknown;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
  poll?: unknown;
  forwardedFrom?: unknown;
};

function parseImportedForwardedFrom(
  raw: unknown,
  channelIdMap: Record<string, string>,
): ForwardedFrom | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const sourceChannelId =
    typeof o.sourceChannelId === 'string' ? o.sourceChannelId.trim() : '';
  const sourceMessageId =
    typeof o.sourceMessageId === 'string' ? o.sourceMessageId.trim() : '';
  const authorName =
    typeof o.authorName === 'string' ? o.authorName.trim() : '';
  const contentPreview =
    typeof o.contentPreview === 'string' ? o.contentPreview : '';
  if (!sourceChannelId || !sourceMessageId || !authorName) return undefined;

  const channelId = channelIdMap[sourceChannelId] ?? sourceChannelId;
  const previewTrimmed = contentPreview.trim();
  const contentPreviewOut = previewTrimmed.length > 0 ? previewTrimmed : ' ';

  const authorAvatar =
    typeof o.authorAvatar === 'string' && o.authorAvatar.trim()
      ? o.authorAvatar.trim()
      : undefined;

  return {
    messageId: sourceMessageId,
    channelId,
    authorName,
    contentPreview: contentPreviewOut,
    ...(authorAvatar ? { authorAvatar } : {}),
  };
}

/** Map Discord API embed JSON (from bot `Embed#toJSON()`) into Echo `Embed` rows. */
function mapDiscordApiEmbedToEcho(raw: Record<string, unknown>): Embed | null {
  const out: Embed = {};
  if (typeof raw.title === 'string' && raw.title.trim())
    out.title = raw.title.trim();
  if (typeof raw.description === 'string' && raw.description.trim()) {
    out.description = raw.description.trim();
  }
  if (typeof raw.url === 'string' && raw.url.trim()) out.url = raw.url.trim();
  if (typeof raw.color === 'number' && Number.isFinite(raw.color)) {
    out.color = raw.color;
  }
  if (typeof raw.timestamp === 'string' && raw.timestamp.trim()) {
    out.timestamp = raw.timestamp.trim();
  }

  const provider = raw.provider;
  if (provider && typeof provider === 'object') {
    const name = String(
      (provider as Record<string, unknown>).name ?? '',
    ).trim();
    if (name) out.provider = name;
  }

  const footer = raw.footer;
  if (footer && typeof footer === 'object') {
    const f = footer as Record<string, unknown>;
    const text = typeof f.text === 'string' ? f.text.trim() : '';
    if (text) {
      out.footer = { text };
      const footIcon = pickDiscordIconUrl(f);
      if (footIcon) out.footer.icon_url = footIcon;
    }
  }

  const image = raw.image;
  if (image && typeof image === 'object') {
    const im = image as Record<string, unknown>;
    const url = pickDiscordUrlOrProxy(im);
    if (url) {
      out.image = { url };
      if (typeof im.width === 'number') out.image.width = im.width;
      if (typeof im.height === 'number') out.image.height = im.height;
    }
  }

  const thumbnail = raw.thumbnail;
  if (thumbnail && typeof thumbnail === 'object') {
    const th = thumbnail as Record<string, unknown>;
    const url = pickDiscordUrlOrProxy(th);
    if (url) {
      out.thumbnail = { url };
      if (typeof th.width === 'number') out.thumbnail.width = th.width;
      if (typeof th.height === 'number') out.thumbnail.height = th.height;
    }
  }

  const author = raw.author;
  if (author && typeof author === 'object') {
    const a = author as Record<string, unknown>;
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    if (name) {
      out.author = { name };
      if (typeof a.url === 'string' && a.url.trim())
        out.author.url = a.url.trim();
      const authIcon = pickDiscordIconUrl(a);
      if (authIcon) out.author.icon_url = authIcon;
    }
  }

  const fields = raw.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    const mapped: NonNullable<Embed['fields']> = [];
    for (const fld of fields) {
      if (!fld || typeof fld !== 'object') continue;
      const f = fld as Record<string, unknown>;
      const name = typeof f.name === 'string' ? f.name : '';
      const value = typeof f.value === 'string' ? f.value : '';
      if (!name.trim() && !value.trim()) continue;
      mapped.push({
        name,
        value,
        inline: f.inline === true,
      });
    }
    if (mapped.length) out.fields = mapped;
  }

  if (
    out.title == null &&
    out.description == null &&
    out.url == null &&
    out.color == null &&
    out.timestamp == null &&
    out.provider == null &&
    out.footer == null &&
    out.image == null &&
    out.thumbnail == null &&
    out.author == null &&
    !out.fields?.length
  ) {
    return null;
  }
  return out;
}

export function parseImportedEmbeds(raw: unknown): Embed[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Embed[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const mapped = mapDiscordApiEmbedToEcho(item as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out.length ? out : undefined;
}

function inferAttachmentKind(
  contentType: string | null | undefined,
  filename: string,
): MessageAttachmentPayload['kind'] {
  const mime = (contentType ?? '').toLowerCase();
  const name = filename.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'document';
  if (
    mime === 'application/msword' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return 'document';
  }
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'image/gif' || name.endsWith('.gif')) return 'gif';
  return 'image';
}

export function parseImportedAttachments(
  raw: unknown,
): MessageAttachmentPayload[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MessageAttachmentPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = pickDiscordUrlOrProxy(o);
    if (!url) continue;
    const filename =
      typeof o.filename === 'string' && o.filename.trim()
        ? o.filename.trim().slice(0, 256)
        : 'attachment';
    const mimeType =
      typeof o.contentType === 'string' && o.contentType.trim()
        ? o.contentType.trim().slice(0, 128)
        : undefined;
    out.push({
      url,
      kind: inferAttachmentKind(mimeType, filename),
      filename,
      ...(mimeType ? { mimeType } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function parseImportedStickers(
  raw: unknown,
): MessageStickerPayload[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MessageStickerPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const format = o.format;
    if (!id || !name || !url) continue;
    if (
      format !== 'png' &&
      format !== 'apng' &&
      format !== 'gif' &&
      format !== 'lottie'
    ) {
      continue;
    }
    out.push({ id, name, url, format });
  }
  return out.length ? out : undefined;
}

/**
 * Imports the last N messages from a Discord channel into an Echo channel.
 * Creates shadow users for Discord authors who don't have a linked Echo account.
 */
export async function runDiscordMessageImport(
  pool: Pool,
  serverId: string,
  echoChannelId: string,
  actorId: string,
  options: DiscordImportMessagesOptions = {},
): Promise<DiscordImportMessagesResult> {
  const limit = Math.min(100, options.limit || 90);

  // 1. Verify preconditions
  const state = await getDiscordImportState(pool, serverId);
  if (!state || !state.channelsImported) {
    throw new Error('Discord channels must be imported first.');
  }

  // Find Discord channel ID from the mapping
  let discordChannelId: string | null = null;
  for (const [dId, eId] of Object.entries(state.channelIdMap)) {
    if (eId === echoChannelId) {
      discordChannelId = dId;
      break;
    }
  }

  if (!discordChannelId) {
    throw new Error('This channel was not imported from Discord.');
  }

  const chType = await pool.query<{ type: string }>(
    `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [echoChannelId, serverId],
  );
  if ((chType.rows[0]?.type ?? '').toLowerCase() === 'voice') {
    throw new Error('Message import is only available for text channels.');
  }

  // 2. Ensure channel is empty
  const channelMsgCount = await countEchoMessagesInChannel(pool, echoChannelId);
  if (channelMsgCount > 0) {
    throw new Error('Channel message import only runs on an empty channel.');
  }

  // 3. Call bot internal server (secret must match `config.echoDiscordBotWebhookSecret`, not raw env:
  // backend dev default lives only on config.)
  const botPort = process.env.ECHO_DISCORD_BOT_INTERNAL_PORT || '3005';
  const botSecret = config.echoDiscordBotWebhookSecret;
  const botUrl = `http://localhost:${botPort}/channels/${discordChannelId}/messages?limit=${limit}`;

  const res = await fetch(botUrl, {
    signal: AbortSignal.timeout(DISCORD_BOT_INTERNAL_FETCH_MS),
    headers: {
      'x-echo-discord-bot-secret': botSecret,
    },
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const errMsg =
      typeof errorBody.error === 'string' ? errorBody.error : res.statusText;
    if (res.status === 401) {
      throw new Error(
        `Bot request failed: ${errMsg}. The Discord export bot’s internal API rejected the call: set the same ECHO_DISCORD_BOT_WEBHOOK_SECRET in the backend and bot process, and ensure the bot is running with ECHO_DISCORD_BOT_INTERNAL_PORT reachable from the API (default localhost:3005).`,
      );
    }
    throw new Error(`Bot request failed: ${errMsg}`);
  }

  const { messages } = (await res.json()) as { messages: BotFetchedMessage[] };

  // 4. Process messages and authors
  let importedCount = 0;

  // Discord returns newest first; reverse to insert in chronological order
  const sortedMessages = [...messages].reverse();

  for (const msg of sortedMessages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;
    const author = m.author;
    if (!author || typeof author !== 'object') continue;
    const authorUserId = await ensureEchoUserForDiscordMember(
      pool,
      serverId,
      author as DiscordAuthorLike,
    );
    const attachments = parseImportedAttachments(m.attachments);
    const stickers = parseImportedStickers(m.stickers);
    const embeds = parseImportedEmbeds(m.embeds);
    const poll = sanitizePollForStorage(m.poll);
    const forwardedFrom = parseImportedForwardedFrom(
      m.forwardedFrom,
      state.channelIdMap,
    );

    const rawContent = typeof m.content === 'string' ? m.content : '';
    const translated = await resolveDiscordSyncedContentMentions(
      pool,
      serverId,
      rawContent,
    );
    let mentions = translated.mentions;
    if (mentions?.length) {
      mentions = await filterMentionsForChannelContext(
        pool,
        echoChannelId,
        mentions,
      );
    }

    // Insert the message.
    // We use the Discord ID as the Echo ID to preserve time and order deterministically.
    await insertEchoMessage(pool, {
      id: String(m.id),
      channelId: echoChannelId,
      authorId: authorUserId,
      content: translated.content,
      ...(mentions?.length ? { mentions } : {}),
      ...(attachments ? { attachments } : {}),
      ...(stickers ? { stickers } : {}),
      ...(embeds ? { embeds } : {}),
      ...(poll ? { poll } : {}),
      ...(forwardedFrom ? { forwardedFrom } : {}),
    });

    await maybeEnqueueDiscordImportMediaMirror(pool, {
      messageId: String(m.id),
      channelId: echoChannelId,
      actorId,
      ...(attachments ? { attachments } : {}),
      ...(stickers ? { stickers } : {}),
      ...(embeds ? { embeds } : {}),
      ...(forwardedFrom ? { forwardedFrom } : {}),
    });

    // Also set the created_at to match the Discord timestamp
    await updateEchoMessageCreatedAtById(
      pool,
      String(m.id),
      typeof m.timestamp === 'string' ? m.timestamp : String(m.timestamp ?? ''),
    );

    importedCount++;
  }

  // 5. Record the import
  await pool.query(
    `INSERT INTO echo_discord_channel_message_imports (channel_id, discord_channel_id, message_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_id) DO UPDATE SET message_count = EXCLUDED.message_count, imported_at = NOW()`,
    [echoChannelId, discordChannelId, importedCount],
  );

  return { importedCount };
}
