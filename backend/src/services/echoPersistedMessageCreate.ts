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
import { redactPollOnMessage } from '../../../shared/types';
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
import { echoMessagesPersistedTotal } from '../observability/echoMetrics';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { resolveAndBroadcastLinkEmbeds } from '../sockets/echoLinkEmbeds';
import { emitEchoAttentionSnapshotsForUsers } from './echoAttentionRealtime';
import { botEventBus } from '../platform/botEventBus';
import { findAllIdTokenMatches } from '../shared/idTokens';
import { mirrorEchoMessageToDiscordIfConfigured } from './discordBridgeOutbound';
import { getEchoUploadPublicUrlPrefixes } from './s3UploadPresign';

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
  const mid = String((rawReplyTo as any).messageId ?? '').trim();
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

function inferE2eeMessageVersionFromCiphertext(
  ciphertext: string | undefined,
): 1 | 2 {
  if (!ciphertext?.trim()) return 1;
  try {
    const o = JSON.parse(ciphertext) as { kind?: unknown };
    if (o?.kind === 'echo-e2ee-v2') return 2;
  } catch {
    /* ignore */
  }
  return 1;
}

export function echoRowToMessage(existing: EchoMessageRow): Message {
  const mf = existing.messageFormatVersion ?? 1;
  const cs = existing.contentSchemaVersion ?? 1;
  const plain = existing.searchIndexText ?? existing.content;
  const e2eeCiphertext =
    typeof existing.e2eeCiphertext === 'string' &&
    existing.e2eeCiphertext.trim()
      ? existing.e2eeCiphertext
      : undefined;
  return {
    id: existing.id,
    channelId: existing.channelId,
    authorId: existing.authorId,
    ...(existing.authorDisplayName !== undefined
      ? { authorDisplayName: existing.authorDisplayName }
      : {}),
    ...(existing.authorAvatar ? { authorAvatar: existing.authorAvatar } : {}),
    ...(existing.authorIsDiscordShadow === true
      ? { authorIsDiscordShadow: true }
      : {}),
    ...(existing.authorDiscordUserId
      ? { authorDiscordUserId: existing.authorDiscordUserId }
      : {}),
    content: existing.content,
    contentText: plain,
    ...(mf >= 2 && existing.contentJson !== undefined
      ? { contentJson: existing.contentJson }
      : {}),
    messageFormatVersion: mf,
    contentSchemaVersion: cs,
    ...(existing.mentions !== undefined
      ? { mentions: existing.mentions as Message['mentions'] }
      : {}),
    timestamp: existing.timestamp,
    ...(existing.replyTo !== undefined
      ? { replyTo: existing.replyTo as ReplyTo }
      : {}),
    ...(existing.editedAt ? { editedAt: existing.editedAt } : {}),
    ...(Array.isArray(existing.embeds) && existing.embeds.length
      ? { embeds: existing.embeds as Message['embeds'] }
      : {}),
    ...(existing.tts === true ? { tts: true } : {}),
    ...(existing.messageFlags != null &&
    Number.isFinite(Number(existing.messageFlags))
      ? { messageFlags: Number(existing.messageFlags) }
      : {}),
    ...(existing.components !== undefined
      ? { components: existing.components }
      : {}),
    ...(existing.imageUrl ? { imageUrl: existing.imageUrl } : {}),
    ...(existing.videoUrl ? { videoUrl: existing.videoUrl } : {}),
    ...(existing.audioUrl ? { audioUrl: existing.audioUrl } : {}),
    ...(existing.gif ? { gif: true } : {}),
    ...(existing.imageSpoiler ? { imageSpoiler: true } : {}),
    ...(existing.poll ? { poll: existing.poll as Message['poll'] } : {}),
    ...(existing.attachments?.length
      ? { attachments: existing.attachments }
      : {}),
    ...(existing.stickers?.length ? { stickers: existing.stickers } : {}),
    ...(existing.forwardedFrom
      ? { forwardedFrom: existing.forwardedFrom }
      : {}),
    ...(existing.bridgeSource === 'discord_inbound'
      ? { bridgeFromDiscord: true }
      : {}),
    ...(existing.bridgeSource ? { bridgeSource: existing.bridgeSource } : {}),
    ...(e2eeCiphertext && existing.e2eeEnvelope
      ? {
          encryption: {
            kind: 'e2ee' as const,
            version: inferE2eeMessageVersionFromCiphertext(e2eeCiphertext),
            senderDeviceId: existing.e2eeSenderDeviceId ?? '',
            envelope: existing.e2eeEnvelope,
            ciphertext: e2eeCiphertext,
          },
        }
      : {}),
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

function stripQueryAndHash(input: string): string {
  const q = input.indexOf('?');
  const h = input.indexOf('#');
  const cut = q === -1 ? h : h === -1 ? q : Math.min(q, h);
  return cut === -1 ? input : input.slice(0, cut);
}

function decodeStorageKeyFromPublicRemainder(
  remainderRaw: string,
): string | null {
  const remainder = remainderRaw.trim().replace(/^\/+/, '');
  if (!remainder) return null;
  const parts = remainder.split('/');
  try {
    const decoded = parts.map((p) => decodeURIComponent(p));
    return decoded.join('/');
  } catch {
    return null;
  }
}

function extractEchoStorageKeyFromPublicUrl(urlRaw: string): string | null {
  const raw = stripQueryAndHash(urlRaw.trim());
  if (!raw) return null;
  const prefixes = getEchoUploadPublicUrlPrefixes().sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of prefixes) {
    const p = prefix.trim();
    if (!p) continue;
    if (raw.startsWith(p)) {
      return decodeStorageKeyFromPublicRemainder(raw.slice(p.length));
    }
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const pathOnly = parsed.pathname;
      for (const prefix of prefixes) {
        const p = prefix.trim();
        if (!p.startsWith('/')) continue;
        if (pathOnly.startsWith(p)) {
          return decodeStorageKeyFromPublicRemainder(pathOnly.slice(p.length));
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

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

  const isE2ee =
    typeof e2eeCiphertext === 'string' && e2eeCiphertext.trim().length > 0;

  if (isE2ee) {
    return {
      ok: false,
      code: 'VALIDATION',
      clientMessageId,
      detail:
        'Encrypted chat messages are no longer supported. Voice uses end-to-end encryption by default.',
    };
  }

  const scopedMentions = await filterMentionsForChannelContext(
    pool,
    channelId,
    sanitizedMentions,
  );

  const safeReplyTo = await resolveSafeReplyTo(pool, channelId, replyTo);
  const messageId = clientMessageId ?? nextEchoSnowflakeId();
  const pollForClients = pollDef
    ? mergePollVotesIntoDefinition(pollDef, [])
    : undefined;
  const searchIndexText = isE2ee ? null : content;
  const message: Message = {
    id: messageId,
    channelId,
    authorId: userId,
    content,
    ...(searchIndexText !== null ? { contentText: searchIndexText } : {}),
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
    ...(isE2ee
      ? {
          encryption: {
            kind: 'e2ee' as const,
            version: (e2eeEncryptionVersion === 2 ? 2 : 1) as 1 | 2,
            senderDeviceId: e2eeSenderDeviceId ?? '',
            envelope: e2eeEnvelope,
            ciphertext: e2eeCiphertext!,
          },
        }
      : {}),
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
      searchIndexText,
      messageFormatVersion,
      contentSchemaVersion,
      ...(forwardedFrom ? { forwardedFrom } : {}),
      ...(isE2ee
        ? {
            e2eeEnvelope,
            e2eeCiphertext,
            ...(e2eeSenderDeviceId ? { e2eeSenderDeviceId } : {}),
          }
        : {}),
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
      if (!isE2ee) {
        void mirrorEchoMessageToDiscordIfConfigured(
          pool,
          log,
          channelId,
          messageForClients,
        );
      }
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
  if (!isE2ee) {
    void resolveAndBroadcastLinkEmbeds(pool, io, log, {
      channelId,
      messageId: message.id,
      authorId: userId,
      content,
      correlationId,
    });
  }

  // Background: increment usage for any custom emojis found in the message
  if (!isE2ee)
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
