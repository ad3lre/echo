import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type { Message } from '../../../shared/types';
import { redactPollOnMessage } from '../../../shared/types';
import type { DiscordAuthorLike } from '../domain/discordImportUsers';
import { ensureEchoUserForDiscordMember } from '../domain/discordImportUsers';
import {
  discordWebhookIdFromUrl,
  getDiscordBridgeForEchoChannel,
  resolveEchoChannelForDiscordBridge,
  tryInsertBridgeIngested,
} from '../domain/discordBridgeRepo';
import {
  getEchoMessageById,
  insertEchoMessage,
  softDeleteEchoMessageSql,
  updateEchoMessageCreatedAtById,
  updateEchoMessageDiscordBridgeSql,
} from '../domain/echoMessagesDal';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import {
  parseImportedAttachments,
  parseImportedEmbeds,
  parseImportedStickers,
} from './discordMessageImport';
import { maybeEnqueueDiscordImportMediaMirror } from './discordImportMediaMirrorQueue';
import { resolveDiscordSyncedContentMentions } from './translateDiscordSyncedMentions';
import { filterMentionsForChannelContext } from '../domain/echoStore/mentionContext';
import {
  buildEchoReplyToSnapshot,
  parseDiscordMessageReference,
} from './discordReplySnapshot';

export type DiscordInboundPayload = {
  discordGuildId: string;
  discordChannelId: string;
  discordMessageId: string;
  /** ISO or Discord snowflake timestamp string */
  timestamp?: string;
  content?: string;
  author?: Record<string, unknown>;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
  /** Discord `message_reference` — quoted parent message id (same channel). */
  messageReference?: unknown;
  /** When set, ignore (our outbound webhook echo). */
  webhookId?: string | null;
};

function authorSnapshotFromRow(
  row: Awaited<ReturnType<typeof getEchoMessageById>>,
): Pick<
  Message,
  | 'authorDisplayName'
  | 'authorAvatar'
  | 'authorIsDiscordShadow'
  | 'authorDiscordUserId'
> {
  if (!row) return { authorDisplayName: 'Unknown' };
  return {
    ...(row.authorDisplayName !== undefined
      ? { authorDisplayName: row.authorDisplayName }
      : { authorDisplayName: 'Unknown' }),
    ...(row.authorAvatar ? { authorAvatar: row.authorAvatar } : {}),
    ...(row.authorIsDiscordShadow === true
      ? { authorIsDiscordShadow: true }
      : {}),
    ...(row.authorDiscordUserId
      ? { authorDiscordUserId: row.authorDiscordUserId }
      : {}),
  };
}

function messageFromEchoRow(
  row: NonNullable<Awaited<ReturnType<typeof getEchoMessageById>>>,
  viewerAuthorId: string,
): Message {
  const authorSnap = authorSnapshotFromRow(row);
  const mf = row.messageFormatVersion ?? 1;
  const cs = row.contentSchemaVersion ?? 1;
  const plain = row.searchIndexText ?? row.content;
  const message: Message = {
    id: row.id,
    channelId: row.channelId,
    authorId: row.authorId,
    content: row.content,
    ...(plain ? { contentText: plain } : {}),
    ...(row.mentions && Array.isArray(row.mentions)
      ? { mentions: row.mentions as Message['mentions'] }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    timestamp: row.timestamp,
    bridgeFromDiscord: true,
    ...authorSnap,
    ...(row.replyTo && typeof row.replyTo === 'object'
      ? { replyTo: row.replyTo as Message['replyTo'] }
      : {}),
    ...(row.attachments?.length ? { attachments: row.attachments } : {}),
    ...(row.stickers?.length ? { stickers: row.stickers } : {}),
    ...(Array.isArray(row.embeds) && row.embeds.length
      ? { embeds: row.embeds as Message['embeds'] }
      : {}),
  };
  return redactPollOnMessage(message, viewerAuthorId);
}

/**
 * Ingest a Discord message into Echo when inbound bridge is enabled.
 * @returns ok:false when skipped (duplicate, disabled, validation); ok:true when inserted.
 */
export async function ingestDiscordBridgeMessage(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  payload: DiscordInboundPayload,
): Promise<
  | { ok: true; message: Message }
  | { ok: false; reason: string; statusCode?: number }
> {
  const guildId = payload.discordGuildId?.trim() ?? '';
  const dChannelId = payload.discordChannelId?.trim() ?? '';
  const dMsgId = payload.discordMessageId?.trim() ?? '';
  if (!guildId || !dChannelId || !dMsgId) {
    return { ok: false, reason: 'missing_ids', statusCode: 400 };
  }

  const resolved = await resolveEchoChannelForDiscordBridge(
    pool,
    guildId,
    dChannelId,
  );
  if (!resolved) {
    return { ok: false, reason: 'unknown_guild_or_channel', statusCode: 404 };
  }

  const bridge = await getDiscordBridgeForEchoChannel(
    pool,
    resolved.echoChannelId,
  );
  if (!bridge || !bridge.inboundEnabled) {
    return { ok: false, reason: 'bridge_disabled', statusCode: 403 };
  }
  if (bridge.discordChannelId.trim() !== dChannelId) {
    return { ok: false, reason: 'channel_mismatch', statusCode: 400 };
  }

  const webhookUrl = bridge.discordWebhookUrl;
  const ourWebhookId =
    webhookUrl && payload.webhookId
      ? discordWebhookIdFromUrl(webhookUrl)
      : null;
  if (
    payload.webhookId &&
    ourWebhookId &&
    String(payload.webhookId) === ourWebhookId
  ) {
    return { ok: false, reason: 'webhook_loop_skip' };
  }

  const claimed = await tryInsertBridgeIngested(pool, dChannelId, dMsgId);
  if (!claimed) {
    return { ok: false, reason: 'duplicate' };
  }

  const author = payload.author;
  if (!author || typeof author !== 'object') {
    await pool.query(
      `DELETE FROM echo_discord_bridge_ingested WHERE discord_channel_id = $1 AND discord_message_id = $2`,
      [dChannelId, dMsgId],
    );
    return { ok: false, reason: 'missing_author', statusCode: 400 };
  }

  const authorUserId = await ensureEchoUserForDiscordMember(
    pool,
    resolved.serverId,
    author as DiscordAuthorLike,
  );

  const attachments = parseImportedAttachments(payload.attachments);
  const stickers = parseImportedStickers(payload.stickers);
  const embeds = parseImportedEmbeds(payload.embeds);
  const rawContent = typeof payload.content === 'string' ? payload.content : '';
  const translated = await resolveDiscordSyncedContentMentions(
    pool,
    resolved.serverId,
    rawContent,
  );
  let mentions = translated.mentions;
  if (mentions?.length) {
    mentions = await filterMentionsForChannelContext(
      pool,
      resolved.echoChannelId,
      mentions,
    );
  }
  const content = translated.content;

  const messageRef = parseDiscordMessageReference(payload.messageReference);
  const replyTo =
    messageRef?.messageId != null
      ? await buildEchoReplyToSnapshot(
          pool,
          resolved.echoChannelId,
          messageRef.messageId,
          messageRef.channelId ?? dChannelId,
        )
      : undefined;

  // Same id as Discord import (`discordMessageId`) so bulk import + live bridge never duplicate.
  const messageId = dMsgId;
  let ins: 'inserted' | 'duplicate';
  try {
    ins = await insertEchoMessage(pool, {
      id: messageId,
      channelId: resolved.echoChannelId,
      authorId: authorUserId,
      content,
      ...(mentions?.length ? { mentions } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
      ...(stickers ? { stickers } : {}),
      ...(embeds ? { embeds } : {}),
      bridgeSource: 'discord_inbound',
    });
  } catch (e) {
    await pool.query(
      `DELETE FROM echo_discord_bridge_ingested WHERE discord_channel_id = $1 AND discord_message_id = $2`,
      [dChannelId, dMsgId],
    );
    log.error(
      { err: e, msg: 'discord_bridge.insert_failed' },
      'Bridge insert failed',
    );
    return { ok: false, reason: 'insert_failed', statusCode: 500 };
  }

  if (ins !== 'inserted') {
    const existing = await getEchoMessageById(pool, messageId);
    if (!existing || existing.channelId !== resolved.echoChannelId) {
      await pool.query(
        `DELETE FROM echo_discord_bridge_ingested WHERE discord_channel_id = $1 AND discord_message_id = $2`,
        [dChannelId, dMsgId],
      );
      return { ok: false, reason: 'insert_failed', statusCode: 500 };
    }
    return { ok: true, message: messageFromEchoRow(existing, authorUserId) };
  }

  const ts =
    typeof payload.timestamp === 'string' && payload.timestamp.trim()
      ? payload.timestamp.trim()
      : new Date().toISOString();
  await updateEchoMessageCreatedAtById(pool, messageId, ts);

  echoMessagesPersistedTotal.inc({ result: 'inserted' });

  await maybeEnqueueDiscordImportMediaMirror(pool, {
    messageId,
    channelId: resolved.echoChannelId,
    actorId: authorUserId,
    ...(attachments ? { attachments } : {}),
    ...(stickers ? { stickers } : {}),
    ...(embeds ? { embeds } : {}),
  });

  const row = await getEchoMessageById(pool, messageId);
  if (!row) {
    return { ok: false, reason: 'load_failed', statusCode: 500 };
  }

  const message = messageFromEchoRow(row, authorUserId);

  if (io) {
    log.info(
      {
        msg: 'discord_bridge.broadcast',
        channelId: resolved.echoChannelId,
        messageId,
      },
      'Broadcast Discord bridge message',
    );
    broadcastToEchoChannel(io, resolved.echoChannelId, 'message', message);
  }

  return {
    ok: true,
    message,
  };
}

async function resolveActiveInboundBridge(
  pool: pg.Pool,
  payload: Pick<
    DiscordInboundPayload,
    'discordGuildId' | 'discordChannelId' | 'discordMessageId'
  >,
): Promise<
  | {
      ok: true;
      echoChannelId: string;
      serverId: string;
      discordChannelId: string;
      discordMessageId: string;
    }
  | { ok: false; reason: string; statusCode?: number }
> {
  const guildId = payload.discordGuildId?.trim() ?? '';
  const dChannelId = payload.discordChannelId?.trim() ?? '';
  const dMsgId = payload.discordMessageId?.trim() ?? '';
  if (!guildId || !dChannelId || !dMsgId) {
    return { ok: false, reason: 'missing_ids', statusCode: 400 };
  }
  const resolved = await resolveEchoChannelForDiscordBridge(
    pool,
    guildId,
    dChannelId,
  );
  if (!resolved) {
    return { ok: false, reason: 'unknown_guild_or_channel', statusCode: 404 };
  }
  const bridge = await getDiscordBridgeForEchoChannel(
    pool,
    resolved.echoChannelId,
  );
  if (!bridge || !bridge.inboundEnabled) {
    return { ok: false, reason: 'bridge_disabled', statusCode: 403 };
  }
  if (bridge.discordChannelId.trim() !== dChannelId) {
    return { ok: false, reason: 'channel_mismatch', statusCode: 400 };
  }
  return {
    ok: true,
    echoChannelId: resolved.echoChannelId,
    serverId: resolved.serverId,
    discordChannelId: dChannelId,
    discordMessageId: dMsgId,
  };
}

/**
 * Apply a Discord message edit to an existing bridged Echo row.
 */
export async function updateDiscordBridgeMessage(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  payload: DiscordInboundPayload,
): Promise<
  | { ok: true; message: Message }
  | { ok: false; reason: string; statusCode?: number }
> {
  const resolved = await resolveActiveInboundBridge(pool, payload);
  if (!resolved.ok) return resolved;

  const existing = await getEchoMessageById(pool, resolved.discordMessageId);
  if (!existing || existing.channelId !== resolved.echoChannelId) {
    return { ok: false, reason: 'not_found', statusCode: 404 };
  }
  if (existing.bridgeSource !== 'discord_inbound') {
    return { ok: false, reason: 'not_bridge_message', statusCode: 403 };
  }

  const attachments = parseImportedAttachments(payload.attachments);
  const stickers = parseImportedStickers(payload.stickers);
  const embeds = parseImportedEmbeds(payload.embeds);
  const rawContent = typeof payload.content === 'string' ? payload.content : '';
  const translated = await resolveDiscordSyncedContentMentions(
    pool,
    resolved.serverId,
    rawContent,
  );
  let mentions = translated.mentions;
  if (mentions?.length) {
    mentions = await filterMentionsForChannelContext(
      pool,
      resolved.echoChannelId,
      mentions,
    );
  }
  const content = translated.content;

  const updated = await updateEchoMessageDiscordBridgeSql(
    pool,
    resolved.echoChannelId,
    resolved.discordMessageId,
    {
      content,
      ...(mentions?.length ? { mentions } : {}),
      ...(attachments ? { attachments } : {}),
      ...(stickers ? { stickers } : {}),
      ...(embeds ? { embeds } : {}),
    },
  );
  if (!updated) {
    return { ok: false, reason: 'not_found', statusCode: 404 };
  }

  const row = await getEchoMessageById(pool, resolved.discordMessageId);
  if (!row) {
    return { ok: false, reason: 'load_failed', statusCode: 500 };
  }
  const message = messageFromEchoRow(row, row.authorId);
  const editedAt = row.editedAt ?? new Date().toISOString();
  const plain = row.searchIndexText ?? row.content ?? '';

  if (io) {
    io.to(resolved.echoChannelId).emit('message:updated', {
      channelId: resolved.echoChannelId,
      messageId: resolved.discordMessageId,
      content: plain,
      contentText: plain,
      editedAt,
      ...(row.attachments?.length ? { attachments: row.attachments } : {}),
      ...(row.stickers?.length ? { stickers: row.stickers } : {}),
      ...(Array.isArray(row.embeds) && row.embeds.length
        ? { embeds: row.embeds }
        : {}),
      bridgeFromDiscord: true,
    });
    log.info(
      {
        msg: 'discord_bridge.update_broadcast',
        channelId: resolved.echoChannelId,
        messageId: resolved.discordMessageId,
      },
      'Broadcast Discord bridge message update',
    );
  }

  return { ok: true, message };
}

/**
 * Soft-delete an Echo row when the source Discord message is deleted.
 */
export async function deleteDiscordBridgeMessage(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  payload: Pick<
    DiscordInboundPayload,
    'discordGuildId' | 'discordChannelId' | 'discordMessageId'
  >,
): Promise<{ ok: true } | { ok: false; reason: string; statusCode?: number }> {
  const resolved = await resolveActiveInboundBridge(pool, payload);
  if (!resolved.ok) return resolved;

  const existing = await getEchoMessageById(pool, resolved.discordMessageId);
  if (!existing || existing.channelId !== resolved.echoChannelId) {
    return { ok: false, reason: 'not_found' };
  }
  if (existing.bridgeSource !== 'discord_inbound') {
    return { ok: false, reason: 'not_bridge_message', statusCode: 403 };
  }

  await softDeleteEchoMessageSql(
    pool,
    resolved.echoChannelId,
    resolved.discordMessageId,
  );

  if (io) {
    broadcastToEchoChannel(io, resolved.echoChannelId, 'message:deleted', {
      channelId: resolved.echoChannelId,
      messageId: resolved.discordMessageId,
    });
    log.info(
      {
        msg: 'discord_bridge.delete_broadcast',
        channelId: resolved.echoChannelId,
        messageId: resolved.discordMessageId,
      },
      'Broadcast Discord bridge message delete',
    );
  }

  return { ok: true };
}
