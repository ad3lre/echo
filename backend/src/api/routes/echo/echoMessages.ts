import { randomUUID } from 'crypto';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { getAuthStore } from '../../../auth/store';
import { config } from '../../../config';
import { sendEchoChannelAccessDenied, sendError } from '../../errors';
import { appendBackendDiagnostic } from '../../../observability/sessionDiagnostics';
import {
  canUserSendMassMentionInChannel,
  diagnoseEchoChannelAccess,
  canUserPostMessage,
  diagnoseEchoPostMessageDenial,
  gatherEchoPostMessageFailureDiagnostics,
  type EchoPostMessageDenialReason,
} from '../../../domain/echoPermissions';
import { redactAnonymousPollsInEchoMessageRows } from '../../../domain/echoMessagePollRedaction';
import {
  blockGuestWritesForIpGuest,
  isGuestWriteComboBlocked,
} from '../../../services/auth/guestAbuseLimiter';
import {
  buildEchoAttentionSnapshot,
  buildEchoSingleChannelAttention,
  checkEchoServerSpamFilter,
  echoChannelAllowsMessageUnderSlowmode,
  echoChannelExistsInDb,
  getEchoChannelReadState,
  getEchoChannelServerId,
  getEchoMessageById,
  assertEchoE2eeDeviceOwned,
  isEchoE2eeThreadEnabled,
  listEchoMessages,
  listPinnedMessageIdsForChannel,
  selectEchoMessageAnchorRowForListDebug,
  selectEchoMessageAuthorDeleted,
  selectEchoMessagesChannelListDebugStats,
  upsertEchoChannelReadState,
  echoSendPlainTextViolatesHardFormat,
  selectEchoChannelMessageFormat,
} from '../../../domain/echoStore';
import { evaluateAutomodOnMessageSend } from '../../../domain/echoStore/automod/messageEval';
import {
  applyAutomodAfterMessagePersisted,
  recordAutomodBlockHits,
} from '../../../services/echoAutomodApply';
import {
  editEchoMessageAndBroadcast,
  deleteEchoMessageAndBroadcast,
} from '../../../services/echoMessageEditDeleteOps';
import {
  addEchoChannelPinAndBroadcast,
  removeEchoChannelPinAndBroadcast,
} from '../../../services/echoChannelPinsOps';
import { isEchoMessageAuthorOrLinkedTwin } from '../../../domain/discordTwinMessageAuth';
import {
  addEchoMessageReactionAndBroadcast,
  removeEchoMessageReactionAndBroadcast,
} from '../../../services/echoMessageReactionOps';
import {
  echoMessageFailedTotal,
  echoPermissionDenialReasonTotal,
} from '../../../observability/echoMetrics';
import { resolveEchoForwardSnapshot } from '../../../domain/echoForwardResolution';
import { echoPersistedMessageCreateAndBroadcast } from '../../../services/echoPersistedMessageCreate';
import { emitEchoReadStateUpdate } from '../../../services/echoAttentionRealtime';
import { broadcastToEchoChannel } from '../../../sockets/channelBroadcast';
import { branchFromPersistedChannelRow } from '../../../sockets/echoMessageFlow';
import { resolveAndBroadcastLinkEmbeds } from '../../../sockets/echoLinkEmbeds';
import { createSocketMessageRateLimiter } from '../../../sockets/messageRateLimiter';
import {
  validateMessageEditPayload,
  validateMessagePayload,
} from '../../../sockets/messageValidation';
import { canDeleteOthersMessagesInChannel } from '../../../domain/echoPolicy';
import type {
  ForwardedFrom,
  MentionEntity,
  MessageFailedCode,
} from '../../../../../shared/types';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const checkHttpMessageRate = createSocketMessageRateLimiter();

function clientIpFromRequest(req: FastifyRequest): string {
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
}

function isAnonymousRestUser(userId: string): boolean {
  return userId.startsWith('user_');
}

function restMessageFailed(code: MessageFailedCode): void {
  echoMessageFailedTotal.inc({ code });
}

export default async function echoMessagesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/channels/read-state',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const workspace = await buildEchoAttentionSnapshot(
        pool,
        req.authUser!.id,
      );
      const readStateByChannelId = Object.fromEntries(
        Object.entries(workspace.channelAttentionByChannelId).map(
          ([channelId, summary]) => [channelId, summary.lastReadMessageId],
        ),
      );
      return reply.code(200).send({
        readStateByChannelId,
      });
    },
  );

  fastify.get(
    '/attention/summary',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const snapshot = await buildEchoAttentionSnapshot(pool, req.authUser!.id);
      return reply.code(200).send(snapshot);
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/read-state',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const lastReadMessageId = await getEchoChannelReadState(
        pool,
        req.authUser!.id,
        channelId,
      );
      req.log.info({
        msg: 'echo.debug.read_state.get',
        requestId: req.id,
        userId: req.authUser!.id,
        channelId,
        lastReadMessageId,
      });
      return reply.code(200).send({ lastReadMessageId });
    },
  );

  fastify.put<{
    Params: { channelId: string };
    Body: { lastReadMessageId?: string };
  }>(
    '/channels/:channelId/read-state',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const mid =
        typeof req.body?.lastReadMessageId === 'string'
          ? req.body.lastReadMessageId.trim()
          : '';
      if (!mid)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'lastReadMessageId required',
        );
      const r = await upsertEchoChannelReadState(
        pool,
        req.authUser!.id,
        channelId,
        mid,
      );
      req.log.info({
        msg: 'echo.debug.read_state.put_attempt',
        requestId: req.id,
        userId: req.authUser!.id,
        channelId,
        submittedLastReadMessageId: mid,
        upsertResult: r,
      });
      if (r === 'not_found')
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Message not in this channel',
        );
      if (r === 'validation')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid lastReadMessageId',
        );
      const userId = req.authUser!.id;
      const nextReadState = await getEchoChannelReadState(
        pool,
        userId,
        channelId,
      );
      req.log.info({
        msg: 'echo.debug.read_state.put_result',
        requestId: req.id,
        userId,
        channelId,
        submittedLastReadMessageId: mid,
        nextReadState,
      });
      const serverId =
        (await getEchoChannelServerId(pool, channelId)) ?? undefined;
      const channelAttention = await buildEchoSingleChannelAttention(
        pool,
        userId,
        channelId,
        {
          lastReadMessageId: nextReadState,
          serverId,
        },
      );
      emitEchoReadStateUpdate(
        fastify.io,
        userId,
        channelId,
        nextReadState,
        channelAttention,
      );
      const snapshot = await buildEchoAttentionSnapshot(pool, userId);
      return reply.code(200).send(snapshot);
    },
  );

  fastify.get<{
    Params: { channelId: string };
    Querystring: { before?: string; limit?: string };
  }>(
    '/channels/:channelId/messages',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const t0 = process.hrtime.bigint();
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const t1 = process.hrtime.bigint();
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit ?? '30', 10) || 30),
      );
      const beforeRaw =
        typeof req.query.before === 'string' ? req.query.before.trim() : '';
      const debugPre = await selectEchoMessagesChannelListDebugStats(
        pool,
        channelId,
      );
      const beforeAnchorRow =
        beforeRaw.length > 0
          ? await selectEchoMessageAnchorRowForListDebug(pool, beforeRaw)
          : null;
      req.log.info({
        msg: 'echo.debug.messages.list_pre',
        requestId: req.id,
        userId: req.authUser!.id,
        channelId,
        before: beforeRaw || null,
        limit,
        totalCountAllRows: debugPre.totalCount,
        liveCountNotDeleted: debugPre.liveCount,
        newestMessageId: debugPre.newestId,
        oldestMessageId: debugPre.oldestId,
        beforeAnchor: beforeAnchorRow
          ? {
              id: beforeAnchorRow.id,
              channelId: beforeAnchorRow.channelId,
              deleted: beforeAnchorRow.deleted,
            }
          : null,
      });
      const msgs = await listEchoMessages(
        pool,
        channelId,
        {
          before: beforeRaw || undefined,
          limit,
        },
        {
          onTiming: (t) => {
            void appendBackendDiagnostic({
              level: 'info',
              domain: 'perf',
              event: 'list_messages_timing',
              stage: 'attempt',
              traceId:
                (req.headers['x-diag-trace-id'] as string | undefined) ||
                (typeof req.id === 'string' ? req.id : undefined),
              spanId:
                (req.headers['x-diag-span-id'] as string | undefined) ||
                undefined,
              parentSpanId:
                (req.headers['x-diag-parent-span-id'] as string | undefined) ||
                undefined,
              durationMs: Math.round(t.totalMs),
              context: {
                channelId: t.channelId,
                before: t.before,
                limit: t.limit,
                messageCount: t.messageCount,
                queryMs: Math.round(t.queryMs),
                pollMs: Math.round(t.pollMs),
                reactionsMs: Math.round(t.reactionsMs),
                authorsMs: Math.round(t.authorsMs),
              },
            });
          },
        },
      );
      const t2 = process.hrtime.bigint();
      const accessMs = Number(t1 - t0) / 1e6;
      const listMs = Number(t2 - t1) / 1e6;
      const totalMs = Number(t2 - t0) / 1e6;
      void appendBackendDiagnostic({
        level: 'info',
        domain: 'perf',
        event: 'channel_messages_http_timing',
        stage: 'attempt',
        traceId:
          (req.headers['x-diag-trace-id'] as string | undefined) ||
          (typeof req.id === 'string' ? req.id : undefined),
        spanId:
          (req.headers['x-diag-span-id'] as string | undefined) || undefined,
        parentSpanId:
          (req.headers['x-diag-parent-span-id'] as string | undefined) ||
          undefined,
        durationMs: Math.round(totalMs),
        context: {
          channelId,
          before: beforeRaw || null,
          limit,
          accessMs: Math.round(accessMs),
          listMs: Math.round(listMs),
          totalMs: Math.round(totalMs),
          resultCount: msgs.length,
          method: req.method,
          path: req.url.split('?')[0] ?? '',
        },
      });
      req.log.info({
        msg: 'echo.debug.messages.list_post',
        requestId: req.id,
        userId: req.authUser!.id,
        channelId,
        before: beforeRaw || null,
        limit,
        resultCount: msgs.length,
        firstResultMessageId: msgs[0]?.id ?? null,
        lastResultMessageId: msgs[msgs.length - 1]?.id ?? null,
      });
      return reply.code(200).send({
        messages: redactAnonymousPollsInEchoMessageRows(msgs, req.authUser!.id),
      });
    },
  );

  fastify.get<{ Params: { channelId: string; messageId: string } }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const row = await getEchoMessageById(pool, messageId);
      if (!row || row.channelId !== channelId) {
        return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
      }
      const [redacted] = redactAnonymousPollsInEchoMessageRows(
        [row],
        req.authUser!.id,
      );
      return reply.code(200).send({ message: redacted });
    },
  );

  fastify.put<{
    Params: { channelId: string; messageId: string };
    Body: { emoji?: string };
  }>(
    '/channels/:channelId/messages/:messageId/reactions',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const emojiRaw =
        typeof req.body?.emoji === 'string' ? req.body.emoji : '';
      const emoji = emojiRaw.trim();
      if (!emoji)
        return sendError(reply, 400, 'INVALID_BODY', 'emoji required');
      const r = await addEchoMessageReactionAndBroadcast(
        pool,
        fastify.io,
        req.authUser!.id,
        channelId,
        messageId,
        emoji,
      );
      if (!r.ok) {
        if (r.code === 'NOT_FOUND')
          return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
        if (r.code === 'VALIDATION')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid emoji');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          r.detail ?? 'Cannot add reaction in this channel',
        );
      }
      return reply.code(200).send({ reactions: r.reactions });
    },
  );

  fastify.delete<{
    Params: { channelId: string; messageId: string };
    Body: { emoji?: string };
  }>(
    '/channels/:channelId/messages/:messageId/reactions',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const emojiRaw =
        typeof req.body?.emoji === 'string' ? req.body.emoji : '';
      const emoji = emojiRaw.trim();
      if (!emoji)
        return sendError(reply, 400, 'INVALID_BODY', 'emoji required');
      const r = await removeEchoMessageReactionAndBroadcast(
        pool,
        fastify.io,
        req.authUser!.id,
        channelId,
        messageId,
        emoji,
      );
      if (!r.ok) {
        if (r.code === 'NOT_FOUND')
          return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
        if (r.code === 'VALIDATION')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid emoji');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          r.detail ?? 'Cannot remove reaction in this channel',
        );
      }
      return reply.code(200).send({ reactions: r.reactions });
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/pins',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const messageIds = await listPinnedMessageIdsForChannel(pool, channelId);
      return reply.code(200).send({ messageIds });
    },
  );

  fastify.post<{ Params: { channelId: string }; Body: { messageId?: string } }>(
    '/channels/:channelId/pins',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId =
        typeof req.body?.messageId === 'string'
          ? req.body.messageId.trim()
          : '';
      if (!messageId)
        return sendError(reply, 400, 'INVALID_BODY', 'messageId required');
      const r = await addEchoChannelPinAndBroadcast(
        pool,
        fastify.io,
        req.authUser!.id,
        channelId,
        messageId,
      );
      if (!r.ok) {
        if (r.code === 'NOT_FOUND')
          return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
        if (r.code === 'VALIDATION')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid message id');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          r.detail ?? 'Cannot pin messages in this channel',
        );
      }
      const messageIds = await listPinnedMessageIdsForChannel(pool, channelId);
      return reply.code(200).send({ messageIds });
    },
  );

  fastify.delete<{ Params: { channelId: string; messageId: string } }>(
    '/channels/:channelId/pins/:messageId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const r = await removeEchoChannelPinAndBroadcast(
        pool,
        fastify.io,
        req.authUser!.id,
        channelId,
        messageId,
      );
      if (!r.ok) {
        if (r.code === 'VALIDATION')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid message id');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          r.detail ?? 'Cannot unpin messages in this channel',
        );
      }
      const messageIds = await listPinnedMessageIdsForChannel(pool, channelId);
      return reply.code(200).send({ messageIds });
    },
  );

  fastify.post<{
    Params: { channelId: string };
    Body: Record<string, unknown>;
  }>(
    '/channels/:channelId/messages',
    { preHandler: [requireAuth, requireEchoStore], bodyLimit: 2_000_000 },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const correlationId = typeof req.id === 'string' ? req.id : randomUUID();
      const ip = clientIpFromRequest(req);

      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? { ...(req.body as Record<string, unknown>) }
          : {};
      body.channelId = channelId;

      const parsed = validateMessagePayload(body);
      if (!parsed.ok) {
        restMessageFailed('VALIDATION');
        return sendError(reply, 400, 'INVALID_BODY', parsed.error);
      }

      if (!checkHttpMessageRate(userId, channelId)) {
        restMessageFailed('RATE_LIMIT');
        if (!isAnonymousRestUser(userId)) {
          try {
            const { store } = await getAuthStore();
            const u = await store.getUserById(userId);
            if (u?.isGuest) {
              blockGuestWritesForIpGuest(ip, userId);
            }
          } catch {
            /* ignore */
          }
        }
        return sendError(reply, 429, 'RATE_LIMIT', 'Too many messages');
      }

      if (!isAnonymousRestUser(userId)) {
        const { store } = await getAuthStore();
        const authU = await store.getUserById(userId);
        if (authU?.isGuest) {
          if (isGuestWriteComboBlocked(ip, userId)) {
            restMessageFailed('GUEST_ABUSE_COOLDOWN');
            return sendError(
              reply,
              429,
              'GUEST_ABUSE_COOLDOWN',
              'Sending paused briefly after too many messages. Create an account for full access.',
            );
          }
          if (
            authU.guestSuspendedUntil &&
            new Date(authU.guestSuspendedUntil).getTime() > Date.now()
          ) {
            restMessageFailed('FORBIDDEN');
            return sendError(reply, 403, 'FORBIDDEN', 'GUEST_SUSPENDED');
          }
          if (!authU.displayName?.trim()) {
            restMessageFailed('FORBIDDEN');
            return sendError(reply, 403, 'FORBIDDEN', 'DISPLAY_NAME_REQUIRED');
          }
          const cap = config.guestMaxTotalMessages;
          if ((authU.guestTotalMessages ?? 0) >= cap) {
            req.log.info({
              msg: 'echo_product_analytics',
              event: 'guest_onboarding_quota_hit',
              userId,
            });
            restMessageFailed('GUEST_LIMIT');
            return sendError(
              reply,
              403,
              'GUEST_LIMIT',
              'Guest message limit reached. Create an account to continue.',
            );
          }
        }
      }

      const persistedChannel = await echoChannelExistsInDb(pool, channelId);
      const branch = branchFromPersistedChannelRow(persistedChannel);
      if (branch === 'reject_unknown') {
        restMessageFailed('UNKNOWN_CHANNEL');
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Channel is not a persisted Echo channel',
        );
      }

      if (isAnonymousRestUser(userId)) {
        restMessageFailed('UNAUTHENTICATED');
        return sendError(
          reply,
          401,
          'UNAUTHENTICATED',
          'Sign in required to post to this channel',
        );
      }

      const postDiag = await diagnoseEchoPostMessageDenial(
        pool,
        userId,
        channelId,
      );
      if (!postDiag.ok) {
        echoPermissionDenialReasonTotal.inc({ reason: postDiag.reason });
        const diagnostics = await gatherEchoPostMessageFailureDiagnostics(
          pool,
          {
            userId,
            channelId,
            reason: postDiag.reason,
            correlationId,
          },
        );
        req.log.warn({
          msg: 'echo.rest.message_failed',
          code: 'FORBIDDEN',
          correlationId,
          channelId,
          userId,
          reason: postDiag.reason,
          diagnostics,
        });
        const detailByReason: Record<EchoPostMessageDenialReason, string> = {
          no_channel: 'Channel is not in the database for this server.',
          not_member: 'You are not a member of this server.',
          banned: 'You are banned from this server.',
          no_view: "You don't have permission to view this channel.",
          timeout: 'You are in a communication timeout in this server.',
          no_send:
            'SEND_MESSAGES is denied for you in this channel after roles + category + channel overwrites. ' +
            'Note: server "capabilities" in settings are server-wide only and do not reflect per-channel overwrites.',
          locked: 'This forum post is locked.',
          archived: 'This forum post is archived.',
          dm_user_blocked:
            'You cannot message this user because one of you has blocked the other.',
          dm_not_allowed:
            'You can only message accepted friends, users you share a server with, or conversations from your message requests.',
          group_dm_not_member: 'You are not a member of this group DM.',
        };
        restMessageFailed('FORBIDDEN');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          detailByReason[postDiag.reason],
          config.echoMessageFailedDiagnosticsToClient
            ? JSON.stringify(diagnostics)
            : undefined,
        );
      }

      const sidForSlow = await getEchoChannelServerId(pool, channelId);
      if (
        sidForSlow &&
        !(await echoChannelAllowsMessageUnderSlowmode(
          pool,
          sidForSlow,
          userId,
          channelId,
        ))
      ) {
        restMessageFailed('SLOWMODE');
        return sendError(
          reply,
          429,
          'SLOWMODE',
          'Slowmode is active in this channel',
        );
      }

      const {
        content,
        mentions: sanitizedMentions,
        replyTo,
        clientMessageId,
        correlationId: corrFromBody,
        imageUrl,
        videoUrl,
        gif,
        imageSpoiler,
        poll: pollDef,
        attachments,
        contentJson,
        messageFormatVersion,
        contentSchemaVersion,
        forwardMessageId,
        e2eeEnvelope,
        e2eeCiphertext,
        e2eeSenderDeviceId,
        e2eeEncryptionVersion,
      } = parsed.value;

      const threadE2eeEnabled = await isEchoE2eeThreadEnabled(pool, channelId);
      const payloadIsE2ee =
        typeof e2eeCiphertext === 'string' && e2eeCiphertext.trim().length > 0;
      if (threadE2eeEnabled && !payloadIsE2ee) {
        restMessageFailed('VALIDATION');
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'E2EE is enabled for this thread. Send an encrypted message payload.',
        );
      }
      if (!threadE2eeEnabled && payloadIsE2ee) {
        restMessageFailed('VALIDATION');
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'E2EE is not enabled for this thread.',
        );
      }

      if (payloadIsE2ee && e2eeSenderDeviceId) {
        const own = await assertEchoE2eeDeviceOwned(
          pool,
          userId,
          e2eeSenderDeviceId,
        );
        if (own !== 'ok') {
          const code =
            own === 'revoked' ? 'E2EE_DEVICE_REVOKED' : 'E2EE_UNKNOWN_DEVICE';
          restMessageFailed(code);
          return sendError(
            reply,
            403,
            code,
            own === 'revoked'
              ? 'This E2EE device was revoked.'
              : 'Unknown E2EE device for this account.',
          );
        }
      }

      if (
        !(await canUserSendMassMentionInChannel(
          pool,
          userId,
          channelId,
          sanitizedMentions,
        ))
      ) {
        restMessageFailed('FORBIDDEN');
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot mention @everyone or @active in this channel.',
        );
      }

      let automodEval: Awaited<
        ReturnType<typeof evaluateAutomodOnMessageSend>
      > | null = null;
      if (sidForSlow) {
        const spamCheck = await checkEchoServerSpamFilter(pool, {
          serverId: sidForSlow,
          userId,
          content,
          mentions: sanitizedMentions,
        });
        if (!spamCheck.ok) {
          restMessageFailed('SPAM_FILTER');
          return sendError(reply, 429, 'SPAM_FILTER', spamCheck.detail);
        }
        automodEval = await evaluateAutomodOnMessageSend(pool, {
          serverId: sidForSlow,
          channelId,
          userId,
          content,
          mentionCount: sanitizedMentions?.length ?? 0,
          correlationId: corrFromBody ?? correlationId,
        });
        if (automodEval.shouldBlock) {
          const own = await pool.query(
            `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
            [sidForSlow],
          );
          const ownerActorId = own.rows[0]
            ? String(own.rows[0].owner_id)
            : '';
          if (ownerActorId) {
            await recordAutomodBlockHits(pool, {
              serverId: sidForSlow,
              ownerActorId,
              channelId,
              userId,
              correlationId: automodEval.correlationId,
              firedRules: automodEval.firedRules,
              log: req.log,
            });
          }
          restMessageFailed('AUTOMOD_BLOCKED');
          return sendError(
            reply,
            403,
            'AUTOMOD_BLOCKED',
            automodEval.blockUserDetail ?? 'Blocked by AutoMod',
          );
        }
      }

      let forwardedFrom: ForwardedFrom | undefined;
      if (forwardMessageId) {
        const fwdRes = await resolveEchoForwardSnapshot(
          pool,
          userId,
          forwardMessageId,
        );
        if (!fwdRes.ok) {
          restMessageFailed('VALIDATION');
          return sendError(reply, 400, 'INVALID_BODY', fwdRes.error);
        }
        forwardedFrom = fwdRes.forwardedFrom;
      }

      const fmtRow = await selectEchoChannelMessageFormat(pool, channelId);
      if (
        fmtRow &&
        echoSendPlainTextViolatesHardFormat({
          template: fmtRow.template,
          hard: fmtRow.hard,
          plain: content,
        })
      ) {
        restMessageFailed('VALIDATION');
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Message must start with this channel’s format template.',
        );
      }

      const persistRes = await echoPersistedMessageCreateAndBroadcast(
        pool,
        fastify.io,
        fastify.log,
        userId,
        {
          channelId,
          content,
          mentions: sanitizedMentions,
          replyTo,
          clientMessageId,
          correlationId: corrFromBody ?? correlationId,
          imageUrl,
          videoUrl,
          gif,
          imageSpoiler,
          poll: pollDef,
          attachments,
          ...(contentJson !== undefined ? { contentJson } : {}),
          messageFormatVersion,
          contentSchemaVersion,
          ...(forwardedFrom ? { forwardedFrom } : {}),
          ...(payloadIsE2ee
            ? {
                e2eeEnvelope,
                e2eeCiphertext,
                e2eeSenderDeviceId,
                e2eeEncryptionVersion,
              }
            : {}),
        },
      );

      if (!persistRes.ok) {
        restMessageFailed(persistRes.code);
        if (persistRes.code === 'IDEMPOTENCY_EXPIRED') {
          return sendError(
            reply,
            409,
            'IDEMPOTENCY_EXPIRED',
            persistRes.detail ?? 'Idempotency window expired',
          );
        }
        if (persistRes.code === 'E2EE_STORAGE_UNAVAILABLE') {
          return sendError(
            reply,
            503,
            'E2EE_STORAGE_UNAVAILABLE',
            persistRes.detail ??
              'Encrypted message storage is not enabled on this database.',
          );
        }
        if (persistRes.code === 'INVALID_ATTACHMENT') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            persistRes.detail ?? 'Attachment URL is not valid for this channel',
          );
        }
        return sendError(
          reply,
          500,
          'PERSIST_FAILED',
          persistRes.detail ?? 'Failed to persist message',
        );
      }

      fastify.log.info({
        msg: 'echo.rest.message_created',
        requestId: req.id,
        channelId,
        userId,
        idempotentReplay: persistRes.kind === 'duplicate_ack',
      });

      if (
        persistRes.kind !== 'duplicate_ack' &&
        sidForSlow &&
        automodEval &&
        automodEval.firedRules.length > 0
      ) {
        const own = await pool.query(
          `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
          [sidForSlow],
        );
        const ownerActorId = own.rows[0]
          ? String(own.rows[0].owner_id)
          : '';
        if (ownerActorId) {
          await applyAutomodAfterMessagePersisted(fastify, pool, {
            serverId: sidForSlow,
            ownerActorId,
            channelId,
            userId,
            messageId: persistRes.message.id,
            correlationId: automodEval.correlationId,
            firedRules: automodEval.firedRules,
            log: req.log,
          });
        }
      }

      if (persistRes.kind === 'duplicate_ack') {
        return reply
          .code(200)
          .send({ message: persistRes.message, idempotentReplay: true });
      }
      return reply.code(201).send({ message: persistRes.message });
    },
  );

  fastify.patch<{
    Params: { channelId: string; messageId: string };
    Body: {
      content?: string;
      contentJson?: unknown;
      contentSchemaVersion?: number;
      attachments?: unknown;
    };
  }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const ok = await canUserPostMessage(pool, req.authUser!.id, channelId);
      if (!ok)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot edit in this channel',
        );
      const meta = await selectEchoMessageAuthorDeleted(
        pool,
        channelId,
        messageId,
      );
      if (!meta) return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
      if (meta.deleted)
        return sendError(reply, 403, 'FORBIDDEN', 'Cannot edit this message');
      const uid = req.authUser!.id;
      if (
        meta.authorId !== uid &&
        !(await isEchoMessageAuthorOrLinkedTwin(pool, uid, meta.authorId))
      ) {
        return sendError(reply, 403, 'FORBIDDEN', 'Cannot edit this message');
      }
      const parsed = validateMessageEditPayload(
        { ...req.body, channelId, messageId },
        { existingMessageFormatVersion: meta.messageFormatVersion },
      );
      if (!parsed.ok)
        return sendError(reply, 400, 'INVALID_BODY', parsed.error);
      const v = parsed.value;
      if (
        v.editKind === 'json' &&
        !(await canUserSendMassMentionInChannel(
          pool,
          req.authUser!.id,
          channelId,
          v.mentions,
        ))
      ) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot mention @everyone or @active in this channel.',
        );
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
      const r = await editEchoMessageAndBroadcast(
        pool,
        fastify.io,
        fastify.log,
        channelId,
        messageId,
        req.authUser!.id,
        editBody,
      );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
      if (r === 'forbidden')
        return sendError(reply, 403, 'FORBIDDEN', 'Cannot edit this message');
      fastify.log.info({
        msg: 'echo.rest.message_patched',
        requestId: req.id,
        channelId,
        messageId,
        userId: req.authUser!.id,
      });
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { channelId: string; messageId: string } }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const messageId = trimEchoPathParam(req.params.messageId);
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const canDeleteOthers = await canDeleteOthersMessagesInChannel(
        pool,
        req.authUser!.id,
        sid,
        channelId,
      );
      const r = await deleteEchoMessageAndBroadcast(
        pool,
        fastify.io,
        channelId,
        messageId,
        req.authUser!.id,
        canDeleteOthers,
      );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Message not found');
      if (r === 'forbidden')
        return sendError(reply, 403, 'FORBIDDEN', 'Cannot delete this message');
      fastify.log.info({
        msg: 'echo.rest.message_deleted',
        requestId: req.id,
        channelId,
        messageId,
        userId: req.authUser!.id,
      });
      return reply.code(204).send();
    },
  );
}
