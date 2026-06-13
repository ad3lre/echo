import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { MentionEntity, MessageFailedCode } from '../../../shared/types';
import { canDeleteOthersMessagesInChannel } from '../domain/echoPolicy';
import {
  canUserAccessChannel,
  canUserPostMessage,
} from '../domain/echoPermissions';
import {
  getEchoChannelServerId,
  getEchoMessageById,
  getEchoStore,
  listEchoDmParticipantUserIds,
  listEchoServerMemberUserIdsCached,
  selectEchoMessageAuthorDeleted,
  softDeleteEchoMessage,
  updateEchoMessageContent,
} from '../domain/echoStore';
import {
  validateImageSlotFillPayload,
  validateMessageEditPayload,
} from './messageValidation';
import { fillEchoMessageImageSlotAndBroadcast } from '../services/echoImageSlotFillBroadcast';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';
import { broadcastToEchoChannel } from './channelBroadcast';
import { resolveAndBroadcastLinkEmbeds } from './echoLinkEmbeds';
import { echoMessageFailedTotal } from '../observability/echoMetrics';
import { emitEchoAttentionSnapshotsForUsers } from '../services/echoAttentionRealtime';
import { isEchoMessageAuthorOrLinkedTwin } from '../domain/discordTwinMessageAuth';
import { evaluateEchoGuildOutboundMessageEditModeration } from '../services/echoGuildOutboundMessageModeration';

function emitFailed(
  socket: Socket,
  code: MessageFailedCode,
  extra?: { channelId?: string; detail?: string; correlationId?: string },
) {
  echoMessageFailedTotal.inc({ code });
  socket.emit('message_failed', { code, ...extra });
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

function messageFailedCodeFromModerationDenial(
  code: string,
): MessageFailedCode {
  if (code === 'SPAM_FILTER') return 'SPAM_FILTER';
  if (code === 'BANNED_WORDS_BLOCKED') return 'BANNED_WORDS_BLOCKED';
  if (code === 'SLOWMODE') return 'SLOWMODE';
  if (code === 'INVALID_BODY') return 'VALIDATION';
  return 'FORBIDDEN';
}

async function emitAttentionForChannel(
  pool: import('pg').Pool,
  io: Server,
  channelId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const dmParticipants = await listEchoDmParticipantUserIds(pool, channelId);
  if (dmParticipants.length > 0) {
    await emitEchoAttentionSnapshotsForUsers(pool, io, dmParticipants, log, {
      mode: 'channel',
      channelId,
    });
    return;
  }
  const serverId = await getEchoChannelServerId(pool, channelId);
  if (!serverId) return;
  const memberIds = await listEchoServerMemberUserIdsCached(pool, serverId);
  await emitEchoAttentionSnapshotsForUsers(pool, io, memberIds, log, {
    mode: 'channel',
    channelId,
    serverId,
  });
}

export function registerMessageEditDeleteHandler(
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const checkMessageRate = getSharedSocketMessageRateLimiter();
  const { authenticated } = options;

  socket.on('message:edit', (payload: unknown) => {
    void (async () => {
      const raw =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const correlationId =
        typeof raw.correlationId === 'string'
          ? raw.correlationId.slice(0, 128)
          : undefined;
      const fail = (
        code: MessageFailedCode,
        extra?: { channelId?: string; detail?: string },
      ) =>
        emitFailed(socket, code, {
          ...extra,
          ...(correlationId ? { correlationId } : {}),
        });
      if (!authenticated || isAnonymousSocketUser(userId)) {
        fail('UNAUTHENTICATED', {
          channelId:
            typeof raw.channelId === 'string'
              ? raw.channelId.trim()
              : undefined,
        });
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        fail('PERSIST_FAILED', {
          channelId:
            typeof raw.channelId === 'string'
              ? raw.channelId.trim()
              : undefined,
        });
        return;
      }
      const channelId =
        typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
      const messageId =
        typeof raw.messageId === 'string' ? raw.messageId.trim() : '';
      if (!channelId || !messageId) {
        log.warn({
          msg: 'echo.socket.message_edit_invalid',
          correlationId,
          socketId: socket.id,
        });
        fail('VALIDATION', { detail: 'channelId and messageId required' });
        return;
      }
      if (!checkMessageRate(userId, channelId)) {
        fail('RATE_LIMIT', { channelId });
        return;
      }
      const okPost = await canUserPostMessage(pool, userId, channelId);
      if (!okPost) {
        log.warn({
          msg: 'echo.socket.message_edit_forbidden',
          correlationId,
          channelId,
          userId,
        });
        fail('FORBIDDEN', { channelId });
        return;
      }
      const meta = await selectEchoMessageAuthorDeleted(
        pool,
        channelId,
        messageId,
      );
      if (!meta) {
        fail('VALIDATION', { channelId, detail: 'not_found' });
        return;
      }
      if (meta.deleted) {
        fail('FORBIDDEN', { channelId });
        return;
      }
      if (
        meta.authorId !== userId &&
        !(await isEchoMessageAuthorOrLinkedTwin(pool, userId, meta.authorId))
      ) {
        fail('FORBIDDEN', { channelId });
        return;
      }
      const parsed = validateMessageEditPayload(payload, {
        existingMessageFormatVersion: meta.messageFormatVersion,
      });
      if (!parsed.ok) {
        fail('VALIDATION', { channelId, detail: parsed.error });
        return;
      }
      const v = parsed.value;
      const guildServerId = await getEchoChannelServerId(pool, channelId);
      const editPlain = v.content;
      if (guildServerId && editPlain.trim()) {
        const moderation = await evaluateEchoGuildOutboundMessageEditModeration(
          pool,
          {
            serverId: guildServerId,
            channelId,
            userId,
            content: editPlain,
            mentions: v.editKind === 'json' ? v.mentions : undefined,
          },
        );
        if (!moderation.ok) {
          fail(messageFailedCodeFromModerationDenial(moderation.denial.code), {
            channelId,
            detail: moderation.denial.detail,
          });
          return;
        }
      }
      const editBody =
        v.editKind === 'legacy'
          ? ({
              kind: 'legacy' as const,
              content: v.content,
              ...(v.attachments !== undefined
                ? { attachments: v.attachments }
                : {}),
            } as const)
          : ({
              kind: 'json' as const,
              content: v.content,
              contentJson: v.contentJson,
              searchIndexText: v.content,
              mentions: v.mentions,
              contentSchemaVersion: v.contentSchemaVersion,
              ...(v.attachments !== undefined
                ? { attachments: v.attachments }
                : {}),
            } as const);

      const r = await updateEchoMessageContent(
        pool,
        channelId,
        messageId,
        userId,
        editBody,
        meta,
      );
      if (r !== 'ok') {
        log.warn({
          msg: 'echo.socket.message_edit_denied',
          correlationId,
          r,
          messageId,
        });
        fail(r === 'not_found' ? 'VALIDATION' : 'FORBIDDEN', {
          channelId,
          detail: r,
        });
        return;
      }
      const row = await getEchoMessageById(pool, messageId);
      const editedAt = row?.editedAt ?? new Date().toISOString();
      const plain = row?.searchIndexText ?? row?.content ?? v.content;
      const mf = row?.messageFormatVersion ?? (v.editKind === 'json' ? 2 : 1);
      const cs =
        row?.contentSchemaVersion ??
        (v.editKind === 'json' ? v.contentSchemaVersion : 1);
      broadcastToEchoChannel(io, channelId, 'message:updated', {
        channelId,
        messageId,
        content: plain,
        contentText: plain,
        editedAt,
        ...(mf >= 2 && row?.contentJson !== undefined
          ? { contentJson: row.contentJson }
          : {}),
        messageFormatVersion: mf,
        contentSchemaVersion: cs,
        ...(row?.mentions !== undefined
          ? { mentions: row.mentions as MentionEntity[] }
          : {}),
        ...(row?.attachments !== undefined
          ? { attachments: row.attachments }
          : {}),
      });
      if (row) {
        void resolveAndBroadcastLinkEmbeds(pool, io, log, {
          channelId,
          messageId,
          authorId: row.authorId,
          content: plain,
          ...(mf >= 2 && row?.contentJson !== undefined
            ? { contentJson: row.contentJson }
            : {}),
          correlationId,
        });
      }
      void emitAttentionForChannel(pool, io, channelId, log);
    })();
  });

  socket.on('message:fillImageSlot', (payload: unknown) => {
    void (async () => {
      const raw =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const correlationId =
        typeof raw.correlationId === 'string'
          ? raw.correlationId.slice(0, 128)
          : undefined;
      const fail = (
        code: MessageFailedCode,
        extra?: { channelId?: string; detail?: string },
      ) =>
        emitFailed(socket, code, {
          ...extra,
          ...(correlationId ? { correlationId } : {}),
        });
      if (!authenticated || isAnonymousSocketUser(userId)) {
        fail('UNAUTHENTICATED', {
          channelId:
            typeof raw.channelId === 'string'
              ? raw.channelId.trim()
              : undefined,
        });
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        fail('PERSIST_FAILED', {
          channelId:
            typeof raw.channelId === 'string'
              ? raw.channelId.trim()
              : undefined,
        });
        return;
      }
      const parsed = validateImageSlotFillPayload(payload);
      if (!parsed.ok) {
        fail('VALIDATION', {
          channelId:
            typeof raw.channelId === 'string'
              ? raw.channelId.trim()
              : undefined,
          detail: parsed.error,
        });
        return;
      }
      const v = parsed.value;
      if (!checkMessageRate(userId, v.channelId)) {
        fail('RATE_LIMIT', { channelId: v.channelId });
        return;
      }
      const okPost = await canUserPostMessage(pool, userId, v.channelId);
      if (!okPost) {
        fail('FORBIDDEN', { channelId: v.channelId });
        return;
      }
      const r = await fillEchoMessageImageSlotAndBroadcast(
        pool,
        io,
        log,
        v.channelId,
        v.messageId,
        userId,
        v.slotId,
        {
          imageUrl: v.imageUrl,
          ...(v.storageKey ? { storageKey: v.storageKey } : {}),
          ...(v.width != null ? { width: v.width } : {}),
          ...(v.height != null ? { height: v.height } : {}),
        },
      );
      if (r === 'ok') {
        void emitAttentionForChannel(pool, io, v.channelId, log);
        return;
      }
      if (r === 'not_found' || r === 'slot_not_found') {
        fail('VALIDATION', { channelId: v.channelId, detail: r });
        return;
      }
      if (r === 'slot_already_filled') {
        fail('VALIDATION', { channelId: v.channelId, detail: r });
        return;
      }
      fail(r === 'forbidden' ? 'FORBIDDEN' : 'VALIDATION', {
        channelId: v.channelId,
        detail: r,
      });
    })();
  });

  socket.on('message:delete', (payload: unknown) => {
    void (async () => {
      const raw =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const channelId =
        typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
      const messageId =
        typeof raw.messageId === 'string' ? raw.messageId.trim() : '';
      const correlationId =
        typeof raw.correlationId === 'string'
          ? raw.correlationId.slice(0, 128)
          : undefined;
      const fail = (
        code: MessageFailedCode,
        extra?: { channelId?: string; detail?: string },
      ) =>
        emitFailed(socket, code, {
          ...extra,
          ...(correlationId ? { correlationId } : {}),
        });
      if (!channelId || !messageId) {
        fail('VALIDATION', { detail: 'channelId and messageId required' });
        return;
      }
      if (!authenticated || isAnonymousSocketUser(userId)) {
        fail('UNAUTHENTICATED', { channelId });
        return;
      }
      if (!checkMessageRate(userId, channelId)) {
        fail('RATE_LIMIT', { channelId });
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        fail('PERSIST_FAILED', { channelId });
        return;
      }
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) {
        fail('VALIDATION', { channelId, detail: 'channel not found' });
        return;
      }
      const canDeleteOthers = await canDeleteOthersMessagesInChannel(
        pool,
        userId,
        sid,
        channelId,
      );
      const okAccess = await canUserAccessChannel(pool, userId, channelId);
      if (!okAccess) {
        fail('FORBIDDEN', { channelId });
        return;
      }
      const r = await softDeleteEchoMessage(
        pool,
        channelId,
        messageId,
        userId,
        canDeleteOthers,
      );
      if (r !== 'ok') {
        log.warn({
          msg: 'echo.socket.message_delete_denied',
          correlationId,
          r,
          messageId,
        });
        fail(r === 'not_found' ? 'VALIDATION' : 'FORBIDDEN', {
          channelId,
          detail: r,
        });
        return;
      }
      broadcastToEchoChannel(io, channelId, 'message:deleted', {
        channelId,
        messageId,
      });
      void emitAttentionForChannel(pool, io, channelId, log);
    })();
  });
}
