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
  updateEchoMessageCreatedAtById,
} from '../domain/echoMessagesDal';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import {
  parseImportedAttachments,
  parseImportedEmbeds,
  parseImportedStickers,
} from './discordMessageImport';
import { maybeEnqueueDiscordImportMediaMirror } from './discordImportMediaMirrorQueue';

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
  const content = typeof payload.content === 'string' ? payload.content : '';

  const messageId = nextEchoSnowflakeId();
  let ins: 'inserted' | 'duplicate';
  try {
    ins = await insertEchoMessage(pool, {
      id: messageId,
      channelId: resolved.echoChannelId,
      authorId: authorUserId,
      content,
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
    await pool.query(
      `DELETE FROM echo_discord_bridge_ingested WHERE discord_channel_id = $1 AND discord_message_id = $2`,
      [dChannelId, dMsgId],
    );
    return { ok: false, reason: 'insert_failed', statusCode: 500 };
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
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    timestamp: row.timestamp,
    bridgeFromDiscord: true,
    ...authorSnap,
    ...(row.attachments?.length ? { attachments: row.attachments } : {}),
    ...(row.stickers?.length ? { stickers: row.stickers } : {}),
    ...(Array.isArray(row.embeds) && row.embeds.length
      ? { embeds: row.embeds as Message['embeds'] }
      : {}),
  };

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
    message: redactPollOnMessage(message, authorUserId),
  };
}
