/**
 * Shared persist + broadcast path for Echo chat messages (socket `message` and REST POST).
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type {
  ForwardedFrom,
  Message,
  MentionEntity,
  MessageAttachmentPayload,
  MessageStickerPayload,
  ReplyTo,
} from '../../../shared/types';
import {
  CHAT_E2EE_REMOVED_DETAIL,
  contentForLegacyEncryptedChatRow,
} from '../../../shared/chatE2eePolicy';
import { redactPollOnMessage } from '../../../shared/types';
import { stripChatE2eeFromEchoMessageRow } from '../domain/echoMessagesDal';
import { getAuthStore } from '../auth/store';
import { config } from '../config';
import type { EchoMessageRow } from '../domain/echoMessagesDal';
import type { EchoPollStoredDefinition } from '../domain/echoPollVotesDal';
import { mergePollVotesIntoDefinition } from '../domain/echoPollVotesDal';
import {
  bumpEchoDmThreadActivity,
  getEchoChannelServerId,
  ECHO_DM_REALM_SERVER_ID,
  getEchoMessageById,
  getEchoMessageCreatedAtById,
  incrementEchoEmojiUsage,
  insertEchoMessage,
  getEchoDmRealtimeThreadForUser,
  listEchoDmParticipantUserIds,
  listEchoServerMembers,
} from '../domain/echoStore';
import { echoMessagesTableHasE2eeColumns } from '../domain/echoMessagesDal';
import { filterMentionsForChannelContext } from '../domain/echoStore/mentionContext';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { isEchoPublicId } from '../../../shared/snowflakeIds';
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { resolveAndBroadcastLinkEmbeds } from '../sockets/echoLinkEmbeds';
import { emitEchoAttentionSnapshotsForUsers } from './echoAttentionRealtime';
import { botEventBus } from '../platform/botEventBus';
import { findAllIdTokenMatches } from '../shared/idTokens';
import { mirrorEchoMessageToDiscordIfConfigured } from './discordBridgeOutbound';
import { extractEchoStorageKeyFromPublicUrl } from './echoUploadPublicUrl';
import { registerChatUploadRetentionFromMessageUrls } from './chatUploadRetention';
import { isEchoChatUserMediaStorageKey } from '../../../shared/chatMediaRetention';
import { isEchoChatUploadAttachmentRegistered } from './echoUploadIntent';

async function resolveSafeReplyTo(
  pool: pg.Pool,
  channelId: string,
  rawReplyTo: unknown,
): Promise<ReplyTo | undefined> {
  if (
    !rawReplyTo ||
    typeof rawReplyTo !== 'object' ||
    Array.isArray(rawReplyTo)
  ) {
    return undefined;
  }
  const mid = String(
    (rawReplyTo as Record<string, unknown>).messageId ?? '',
  ).trim();
  if (!mid) return undefined;

  const row = await getEchoMessageById(pool, mid);
  if (!row) return undefined;

  // Discord allows replying across channels in some contexts, but Echo's UI
  // and model currently expect same-channel replies for the 'replyTo' field.
  // (Cross-channel is handled via 'forwardedFrom' / 'forwardMessageId').
  if (row.channelId !== channelId) return undefined;

  const plain = (row.searchIndexText ?? row.content ?? '').trim();
  const preview = plain.length > 500 ? `${plain.slice(0, 499)}…` : plain;

  return {
    messageId: row.id,
    authorId: row.authorId,
    authorName: row.authorDisplayName || 'Unknown',
    authorAvatar: row.authorAvatar,
    content: preview || '(no text)',
  };
}

export type EchoPersistedMessageInput = {
  channelId: string;
  content: string;
  mentions?: MentionEntity[];
  replyTo?: unknown;
  clientMessageId?: string;
  correlationId?: string;
  imageUrl?: string;
  videoUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  poll?: EchoPollStoredDefinition;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  contentJson?: unknown;
  messageFormatVersion: number;
  contentSchemaVersion: number;
  forwardedFrom?: ForwardedFrom;
  e2eeEnvelope?: unknown;
  e2eeCiphertext?: string;
  e2eeSenderDeviceId?: string;
  e2eeEncryptionVersion?: 1 | 2;
};

export function echoRowToMessage(existing: EchoMessageRow): Message {
  const row = stripChatE2eeFromEchoMessageRow(existing);
  const mf = row.messageFormatVersion ?? 1;
  const cs = row.contentSchemaVersion ?? 1;
  const plain =
    row.searchIndexText ??
    contentForLegacyEncryptedChatRow(row.content, existing.e2eeCiphertext);
  return {
    id: row.id,
    channelId: row.channelId,
    authorId: row.authorId,
    ...(row.authorDisplayName !== undefined
      ? { authorDisplayName: row.authorDisplayName }
      : {}),
    ...(row.authorAvatar ? { authorAvatar: row.authorAvatar } : {}),
    ...(row.authorIsDiscordShadow === true
      ? { authorIsDiscordShadow: true }
      : {}),
    ...(row.authorDiscordUserId
      ? { authorDiscordUserId: row.authorDiscordUserId }
      : {}),
    content: row.content,
    contentText: plain,
    ...(mf >= 2 && row.contentJson !== undefined
      ? { contentJson: row.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(row.mentions !== undefined
      ? { mentions: row.mentions as Message['mentions'] }
      : {}),
    timestamp: row.timestamp,
    ...(row.replyTo !== undefined ? { replyTo: row.replyTo as ReplyTo } : {}),
    ...(row.editedAt ? { editedAt: row.editedAt } : {}),
    ...(Array.isArray(row.embeds) && row.embeds.length
      ? { embeds: row.embeds as Message['embeds'] }
      : {}),
    ...(row.tts === true ? { tts: true } : {}),
    ...(row.messageFlags != null && Number.isFinite(Number(row.messageFlags))
      ? { messageFlags: Number(row.messageFlags) }
      : {}),
    ...(row.components !== undefined ? { components: row.components } : {}),
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.videoUrl ? { videoUrl: row.videoUrl } : {}),
    ...(row.audioUrl ? { audioUrl: row.audioUrl } : {}),
    ...(row.gif ? { gif: true } : {}),
    ...(row.imageSpoiler ? { imageSpoiler: true } : {}),
    ...(row.poll ? { poll: row.poll as Message['poll'] } : {}),
    ...(row.attachments?.length ? { attachments: row.attachments } : {}),
    ...(row.stickers?.length ? { stickers: row.stickers } : {}),
    ...(row.forwardedFrom ? { forwardedFrom: row.forwardedFrom } : {}),
    ...(row.systemMessage === true ? { systemMessage: true } : {}),
    ...(row.bridgeSource === 'discord_inbound'
      ? { bridgeFromDiscord: true }
      : {}),
    ...(row.bridgeSource ? { bridgeSource: row.bridgeSource } : {}),
  };
}

async function authorSnapshotForBroadcast(
  userId: string,
): Promise<Pick<Message, 'authorDisplayName' | 'authorAvatar'>> {
  try {
    const { store } = await getAuthStore();
    const authUser = await store.getUserById(userId);
    if (!authUser) return { authorDisplayName: 'Unknown' };
    const authorDisplayName =
      authUser.displayName?.trim() || authUser.username?.trim() || 'Unknown';
    const p = authUser.pfp?.trim();
    return { authorDisplayName, ...(p ? { authorAvatar: p } : {}) };
  } catch {
    return { authorDisplayName: 'Unknown' };
  }
}

export type EchoPersistedMessageCreateResult =
  | { ok: true; kind: 'broadcast'; message: Message }
  | { ok: true; kind: 'duplicate_ack'; message: Message }
  | {
      ok: false;
      code:
        | 'PERSIST_FAILED'
        | 'IDEMPOTENCY_EXPIRED'
        | 'E2EE_STORAGE_UNAVAILABLE'
        | 'INVALID_ATTACHMENT'
        | 'VALIDATION';
      clientMessageId?: string;
      detail?: string;
    };

async function validateEchoUploadAttachmentOwnership(opts: {
  pool: pg.Pool;
  userId: string;
  channelId: string;
  imageUrl?: string;
  videoUrl?: string;
  attachments?: MessageAttachmentPayload[];
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const urls: string[] = [];
  if (typeof opts.imageUrl === 'string' && opts.imageUrl.trim()) {
    urls.push(opts.imageUrl.trim());
  }
  if (typeof opts.videoUrl === 'string' && opts.videoUrl.trim()) {
    urls.push(opts.videoUrl.trim());
  }
  for (const item of opts.attachments ?? []) {
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (url) urls.push(url);
  }
  if (urls.length === 0) return { ok: true };

  const serverId = await getEchoChannelServerId(opts.pool, opts.channelId);
  const allowedPrefixes = [`echo/channels/${opts.channelId}/${opts.userId}/`];
  if (serverId) {
    allowedPrefixes.push(`echo/${serverId}/${opts.userId}/`);
  }
  for (const url of urls) {
    const storageKey = extractEchoStorageKeyFromPublicUrl(url);
    if (!storageKey) continue;
    const owned = allowedPrefixes.some((prefix) =>
      storageKey.startsWith(prefix),
    );
    if (!owned) {
      return {
        ok: false,
        detail: 'Attachment URL is not owned by sender for this channel scope',
      };
    }
    if (isEchoChatUserMediaStorageKey(storageKey)) {
      const registered = await isEchoChatUploadAttachmentRegistered(
        opts.pool,
        storageKey,
        opts.userId,
      );
      if (!registered) {
        return {
          ok: false,
          detail: 'Attachment upload is not registered for this channel',
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Insert (or reconcile duplicate id) and broadcast `message` / `message_ack` side effects.
 * Caller must have already validated payload, auth, channel branch, post permission, and slowmode.
 */
export async function echoPersistedMessageCreateAndBroadcast(
  pool: pg.Pool,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  input: EchoPersistedMessageInput,
): Promise<EchoPersistedMessageCreateResult> {
  const {
    channelId,
    content,
    mentions: sanitizedMentions,
    replyTo,
    clientMessageId,
    correlationId,
    imageUrl,
    videoUrl,
    gif,
    imageSpoiler,
    poll: pollDef,
    attachments,
    stickers,
    contentJson,
    messageFormatVersion,
    contentSchemaVersion,
    forwardedFrom,
    e2eeEnvelope,
    e2eeCiphertext,
    e2eeSenderDeviceId,
    e2eeEncryptionVersion,
  } = input;

  const attachmentOwnership = await validateEchoUploadAttachmentOwnership({
    pool,
    userId,
    channelId,
    imageUrl,
    videoUrl,
    attachments,
  });
  if (!attachmentOwnership.ok) {
    return {
      ok: false,
      code: 'INVALID_ATTACHMENT',
      clientMessageId,
      detail: attachmentOwnership.detail,
    };
  }

  await registerChatUploadRetentionFromMessageUrls(pool, {
    uploaderId: userId,
    attachments,
    imageUrl,
    videoUrl,
    sourceType: 'user',
  });

  if (typeof e2eeCiphertext === 'string' && e2eeCiphertext.trim().length > 0) {
    return {
      ok: false,
      code: 'VALIDATION',
      clientMessageId,
      detail: CHAT_E2EE_REMOVED_DETAIL,
    };
  }

  const scopedMentions = await filterMentionsForChannelContext(
    pool,
    channelId,
    sanitizedMentions,
  );

  const safeReplyTo = await resolveSafeReplyTo(pool, channelId, replyTo);
  const messageId =
    clientMessageId && isEchoPublicId(clientMessageId)
      ? clientMessageId
      : nextEchoSnowflakeId();
  const pollForClients = pollDef
    ? mergePollVotesIntoDefinition(pollDef, [])
    : undefined;
  const message: Message = {
    id: messageId,
    channelId,
    authorId: userId,
    content,
    contentText: content,
    ...(messageFormatVersion >= 2 && contentJson !== undefined
      ? { contentJson }
      : {}),
    messageFormatVersion,
    contentSchemaVersion,
    ...(scopedMentions?.length ? { mentions: scopedMentions } : {}),
    timestamp: new Date().toISOString(),
    ...(safeReplyTo ? { replyTo: safeReplyTo } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    ...(gif ? { gif: true } : {}),
    ...(imageSpoiler ? { imageSpoiler: true } : {}),
    ...(pollForClients ? { poll: pollForClients } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(stickers && stickers.length > 0 ? { stickers } : {}),
    ...(forwardedFrom ? { forwardedFrom } : {}),
  };

  let persistResult: 'inserted' | 'duplicate';
  try {
    persistResult = await insertEchoMessage(pool, {
      id: message.id,
      channelId,
      authorId: userId,
      content,
      mentions: scopedMentions,
      replyTo: safeReplyTo,
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(gif ? { gif: true } : {}),
      ...(imageSpoiler ? { imageSpoiler: true } : {}),
      ...(pollDef ? { poll: pollDef } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(stickers && stickers.length > 0 ? { stickers } : {}),
      ...(contentJson !== undefined ? { contentJson } : {}),
      searchIndexText: content,
      messageFormatVersion,
      contentSchemaVersion,
      ...(forwardedFrom ? { forwardedFrom } : {}),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'E2EE_STORAGE_UNAVAILABLE') {
      return {
        ok: false,
        code: 'E2EE_STORAGE_UNAVAILABLE',
        clientMessageId,
        detail:
          'Encrypted message storage is not enabled on this database yet (missing echo_messages E2EE columns). Plain messages still work.',
      };
    }
    log.error(
      {
        err: e,
        msg: 'echo.persist_message_failed',
        correlationId,
        channelId,
        messageId: message.id,
      },
      'Failed to persist message',
    );
    return { ok: false, code: 'PERSIST_FAILED', clientMessageId };
  }

  if (persistResult === 'duplicate') {
    const createdAt = await getEchoMessageCreatedAtById(pool, message.id);
    const windowMs = config.echoMessageIdempotencyMinutes * 60_000;
    if (createdAt && Date.now() - createdAt.getTime() > windowMs) {
      log.warn({
        msg: 'echo.message_idempotency_expired',
        correlationId,
        channelId,
        messageId: message.id,
      });
      return {
        ok: false,
        code: 'IDEMPOTENCY_EXPIRED',
        clientMessageId,
        detail: `Idempotency window is ${config.echoMessageIdempotencyMinutes} minutes`,
      };
    }
    echoMessagesPersistedTotal.inc({ result: 'duplicate' });
    const existing = await getEchoMessageById(pool, message.id);
    if (existing) {
      return {
        ok: true,
        kind: 'duplicate_ack',
        message: redactPollOnMessage(echoRowToMessage(existing), userId),
      };
    }
    return { ok: false, code: 'PERSIST_FAILED', clientMessageId };
  }

  echoMessagesPersistedTotal.inc({ result: 'inserted' });

  void (async () => {
    try {
      const { store } = await getAuthStore();
      const n = await store.incrementGuestMessageCount(userId);
      if (n === 1) {
        log.info({
          msg: 'echo_product_analytics',
          event: 'guest_first_message_sent',
          userId,
        });
      }
    } catch {
      /* ignore */
    }
  })();

  log.info({
    msg: 'echo.message_broadcast',
    correlationId,
    channelId,
    messageId: message.id,
    branch: 'echo_persisted',
  });
  const authorSnap = await authorSnapshotForBroadcast(userId);
  const messageForClients: Message = { ...message, ...authorSnap };
  log.info(
    {
      msg: 'echo.message_broadcast_emit',
      correlationId,
      channelId,
      messageId: message.id,
      recipientsRoom: channelId,
    },
    'Broadcasting persisted message to channel room',
  );
  broadcastToEchoChannel(io, channelId, 'message', messageForClients);
  const dmRecipients = await listEchoDmParticipantUserIds(pool, channelId);
  if (dmRecipients.length > 0) {
    // Bump the authoritative inbox sort key BEFORE selecting the thread payload so the
    // resulting `lastActivityAt` reflects this message (and not a stale older value).
    await bumpEchoDmThreadActivity(
      pool,
      channelId,
      message.timestamp,
      'message',
    );
  }
  for (const recipientUserId of dmRecipients) {
    if (!recipientUserId) continue;
    const thread = await getEchoDmRealtimeThreadForUser(
      pool,
      channelId,
      recipientUserId,
    );
    if (!thread) continue;
    io.to(`echo:user:${recipientUserId}`).emit('dm:activity', {
      thread,
      message: messageForClients,
    });
  }
  if (dmRecipients.length > 0) {
    void emitEchoAttentionSnapshotsForUsers(pool, io, dmRecipients, log);
  } else {
    const serverId = await getEchoChannelServerId(pool, channelId);
    if (serverId) {
      const members = await listEchoServerMembers(pool, serverId);
      void emitEchoAttentionSnapshotsForUsers(
        pool,
        io,
        members.map((member) => member.userId),
        log,
      );
      botEventBus.emitBotEvent({
        kind: 'message',
        channelId,
        serverId,
        message: messageForClients,
      });
      void mirrorEchoMessageToDiscordIfConfigured(
        pool,
        log,
        channelId,
        messageForClients,
      );
    }
  }
  log.info(
    {
      msg: 'echo.message_broadcast_done',
      correlationId,
      channelId,
      messageId: message.id,
    },
    'Completed channel message broadcast',
  );
  void resolveAndBroadcastLinkEmbeds(pool, io, log, {
    channelId,
    messageId: message.id,
    authorId: userId,
    content,
    ...(messageFormatVersion >= 2 && contentJson !== undefined
      ? { contentJson }
      : {}),
    correlationId,
  });

  // Background: increment usage for any custom emojis found in the message
  void (async () => {
    try {
      const serverId = await pool
        .query<{
          server_id: string;
        }>(`SELECT server_id FROM echo_channels WHERE id = $1`, [channelId])
        .then((r) => r.rows[0]?.server_id);

      if (serverId) {
        const tokens = findAllIdTokenMatches(content);
        for (const match of tokens) {
          if (match.token.kind === 'emoji') {
            await incrementEchoEmojiUsage(
              pool,
              serverId,
              userId,
              match.token.id,
            );
          }
        }
      }
    } catch (e) {
      log.error(
        { err: e, channelId, messageId: message.id },
        'Failed to increment emoji usage for message',
      );
    }
  })();

  return {
    ok: true,
    kind: 'broadcast',
    message: redactPollOnMessage(messageForClients, userId),
  };
}

/**
 * Post a plain-text channel (or DM) message as the server owner for AutoMod notices.
 * Skips Discord outbound mirror and link-embed resolution. Validates guild channel server
 * or DM channel participation for the owner actor.
 */
export async function echoAutomodPostOwnerChannelNotice(
  pool: pg.Pool,
  io: Server | undefined,
  log: FastifyBaseLogger,
  input: {
    /** Real guild id (automod context); used to validate guild text channels. */
    guildServerId: string;
    targetChannelId: string;
    ownerActorId: string;
    content: string;
    correlationId: string;
  },
): Promise<{ ok: true; messageId: string } | { ok: false; reason: string }> {
  const content = String(input.content ?? '').trim();
  if (!content) return { ok: false, reason: 'empty_content' };

  const chanServer = await getEchoChannelServerId(pool, input.targetChannelId);
  if (!chanServer) return { ok: false, reason: 'unknown_channel' };

  if (chanServer === ECHO_DM_REALM_SERVER_ID) {
    const participants = await listEchoDmParticipantUserIds(
      pool,
      input.targetChannelId,
    );
    if (!participants.includes(input.ownerActorId)) {
      return { ok: false, reason: 'dm_owner_not_participant' };
    }
  } else if (chanServer !== input.guildServerId) {
    return { ok: false, reason: 'wrong_server' };
  }

  const messageId = nextEchoSnowflakeId();
  try {
    await insertEchoMessage(pool, {
      id: messageId,
      channelId: input.targetChannelId,
      authorId: input.ownerActorId,
      content,
      searchIndexText: content,
      messageFormatVersion: 1,
      contentSchemaVersion: 1,
      bridgeSource: 'automod_notice',
    });
  } catch (e) {
    log.warn(
      {
        err: e,
        msg: 'echo.automod.notice_insert_failed',
        correlationId: input.correlationId,
        channelId: input.targetChannelId,
      },
      'AutoMod notice insert failed',
    );
    return { ok: false, reason: 'insert_failed' };
  }

  echoMessagesPersistedTotal.inc({ result: 'inserted' });

  const row = await getEchoMessageById(pool, messageId);
  if (!row) return { ok: false, reason: 'row_missing' };

  const messageBase = echoRowToMessage(row);
  const authorSnap = await authorSnapshotForBroadcast(input.ownerActorId);
  const messageForClients: Message = { ...messageBase, ...authorSnap };

  log.info(
    {
      msg: 'echo.automod.notice_broadcast',
      correlationId: input.correlationId,
      channelId: input.targetChannelId,
      messageId,
    },
    'Broadcasting AutoMod notice',
  );

  if (io) {
    broadcastToEchoChannel(
      io,
      input.targetChannelId,
      'message',
      messageForClients,
    );
  }

  const dmRecipients = await listEchoDmParticipantUserIds(
    pool,
    input.targetChannelId,
  );
  if (dmRecipients.length > 0) {
    await bumpEchoDmThreadActivity(
      pool,
      input.targetChannelId,
      new Date(messageForClients.timestamp),
      'message',
    );
    for (const recipientUserId of dmRecipients) {
      if (!recipientUserId) continue;
      const thread = await getEchoDmRealtimeThreadForUser(
        pool,
        input.targetChannelId,
        recipientUserId,
      );
      if (!thread || !io) continue;
      io.to(`echo:user:${recipientUserId}`).emit('dm:activity', {
        thread,
        message: messageForClients,
      });
    }
    if (io) {
      void emitEchoAttentionSnapshotsForUsers(pool, io, dmRecipients, log);
    }
  } else if (io) {
    const sid = await getEchoChannelServerId(pool, input.targetChannelId);
    if (sid && sid !== ECHO_DM_REALM_SERVER_ID) {
      const members = await listEchoServerMembers(pool, sid);
      void emitEchoAttentionSnapshotsForUsers(
        pool,
        io,
        members.map((m) => m.userId),
        log,
      );
      botEventBus.emitBotEvent({
        kind: 'message',
        channelId: input.targetChannelId,
        serverId: sid,
        message: messageForClients,
      });
    }
  }

  return { ok: true, messageId };
}
