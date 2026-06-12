import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { Socket, Server } from 'socket.io';
import type { ForwardedFrom, MessageFailedCode } from '../../../shared/types';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';
import { validateMessagePayload } from './messageValidation';
import { config } from '../config';
import {
  canUserSendMassMentionInChannel,
  evaluateEchoPostMessageAccess,
  gatherEchoPostMessageFailureDiagnostics,
  type EchoPostMessageAccessContext,
  type EchoPostMessageDenialReason,
} from '../domain/echoPermissions';
import { resolveStickerIdsForChannel } from '../domain/echoStore/stickerResolver';
import { getAuthStore } from '../auth/store';
import {
  checkEchoServerSpamFilter,
  echoChannelAllowsMessageUnderSlowmode,
  echoChannelExistsInDb,
  echoSendPlainTextViolatesHardFormat,
  isEchoChannelWithinForumContext,
  getEchoStore,
  selectEchoChannelMessageFormat,
} from '../domain/echoStore';
import { branchFromPersistedChannelRow } from './echoMessageFlow';
import { resolveEchoForwardSnapshot } from '../domain/echoForwardResolution';
import { echoPersistedMessageCreateAndBroadcast } from '../services/echoPersistedMessageCreate';
import {
  echoMessageFailedTotal,
  echoPermissionDenialReasonTotal,
  echoSocketBranchTotal,
  echoSocketHandlerDurationSeconds,
} from '../observability/echoMetrics';
import {
  blockGuestWritesForIpGuest,
  isGuestWriteComboBlocked,
} from '../services/auth/guestAbuseLimiter';
import { evaluateBannedWordsOnMessageSend } from '../domain/echoStore/bannedWords/messageEval';
import { applyBannedWordsAfterMessagePersisted } from '../services/echoBannedWordsApply';
import { clientIpFromSocketHandshake } from '../net/clientIp';

function clientIpFromSocket(socket: Socket): string {
  return clientIpFromSocketHandshake(
    socket.handshake.headers as Record<string, string | string[] | undefined>,
    socket.handshake.address,
    config.trustProxy,
  );
}

function emitMessageFailed(
  socket: Socket,
  payload: {
    code: MessageFailedCode;
    channelId?: string;
    clientMessageId?: string;
    detail?: string;
    diagnostics?: Record<string, unknown>;
  },
): void {
  echoMessageFailedTotal.inc({ code: payload.code });
  socket.emit('message_failed', payload);
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

export function registerMessageHandler(
  fastify: FastifyInstance,
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean; handshakeCorrelationId?: string },
): void {
  const checkMessageRate = getSharedSocketMessageRateLimiter();
  const { authenticated } = options;

  socket.on('message', (payload) => {
    const endTimer = echoSocketHandlerDurationSeconds.startTimer();
    void (async () => {
      const raw =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const rawChannelId =
        typeof raw.channelId === 'string' ? raw.channelId : undefined;
      const rawClientId = typeof raw.id === 'string' ? raw.id : undefined;
      log.debug(
        {
          msg: 'echo.socket.message_received',
          socketId: socket.id,
          userId,
          rawChannelId,
          rawClientId,
          hasObjectPayload: !!payload && typeof payload === 'object',
        },
        'Received socket message payload',
      );

      try {
        const parsed = validateMessagePayload(payload);
        if (!parsed.ok) {
          log.warn(
            {
              msg: 'echo.socket.message_invalid',
              socketId: socket.id,
              userId,
              rawChannelId,
              rawClientId,
              error: parsed.error,
            },
            'Rejected invalid socket message payload',
          );
          log.warn({
            msg: 'echo.socket.message_failed',
            code: 'VALIDATION',
            socketId: socket.id,
          });
          emitMessageFailed(socket, {
            code: 'VALIDATION',
            channelId: rawChannelId,
            clientMessageId: rawClientId,
            detail: parsed.error,
          });
          return;
        }

        const {
          channelId,
          content,
          mentions: sanitizedMentions,
          replyTo,
          clientMessageId,
          correlationId: correlationIdFromPayload,
          imageUrl,
          videoUrl,
          gif,
          imageSpoiler,
          poll: pollDef,
          attachments,
          stickerIds,
          contentJson,
          messageFormatVersion,
          contentSchemaVersion,
          forwardMessageId,
        } = parsed.value;
        const correlationId =
          correlationIdFromPayload ?? options.handshakeCorrelationId;

        if (!checkMessageRate(userId, channelId)) {
          log.warn({
            msg: 'echo.socket.message_failed',
            code: 'RATE_LIMIT',
            socketId: socket.id,
          });
          if (authenticated && !isAnonymousSocketUser(userId)) {
            try {
              const { store } = await getAuthStore();
              const u = await store.getUserById(userId);
              if (u?.isGuest) {
                await blockGuestWritesForIpGuest(
                  clientIpFromSocket(socket),
                  userId,
                );
              }
            } catch {
              /* ignore */
            }
          }
          emitMessageFailed(socket, {
            code: 'RATE_LIMIT',
            channelId: rawChannelId,
            clientMessageId: rawClientId,
          });
          return;
        }

        if (authenticated && !isAnonymousSocketUser(userId)) {
          const { store } = await getAuthStore();
          const authU = await store.getUserById(userId);
          if (authU?.isGuest) {
            if (
              await isGuestWriteComboBlocked(clientIpFromSocket(socket), userId)
            ) {
              emitMessageFailed(socket, {
                code: 'GUEST_ABUSE_COOLDOWN',
                channelId: rawChannelId,
                clientMessageId: rawClientId,
                detail:
                  'Sending paused briefly after too many messages. Create an account for full access.',
              });
              return;
            }
            if (
              authU.guestSuspendedUntil &&
              new Date(authU.guestSuspendedUntil).getTime() > Date.now()
            ) {
              emitMessageFailed(socket, {
                code: 'FORBIDDEN',
                channelId: rawChannelId,
                clientMessageId: rawClientId,
                detail: 'GUEST_SUSPENDED',
              });
              return;
            }
            if (!authU.displayName?.trim()) {
              emitMessageFailed(socket, {
                code: 'FORBIDDEN',
                channelId: rawChannelId,
                clientMessageId: rawClientId,
                detail: 'DISPLAY_NAME_REQUIRED',
              });
              return;
            }
            const cap = config.guestMaxTotalMessages;
            if ((authU.guestTotalMessages ?? 0) >= cap) {
              log.info({
                msg: 'echo_product_analytics',
                event: 'guest_onboarding_quota_hit',
                userId,
              });
              emitMessageFailed(socket, {
                code: 'GUEST_LIMIT',
                channelId: rawChannelId,
                clientMessageId: rawClientId,
                detail:
                  'Guest message limit reached. Create an account to continue.',
              });
              return;
            }
          }
        }

        const { enabled, pool } = await getEchoStore();
        let persistedChannel = false;
        if (enabled && pool) {
          persistedChannel = await echoChannelExistsInDb(pool, channelId);
        }

        const branch =
          enabled && pool
            ? branchFromPersistedChannelRow(persistedChannel)
            : 'reject_unknown';

        echoSocketBranchTotal.inc({ branch });

        log.debug({
          msg: 'echo.socket.message_branch',
          branch,
          correlationId,
          channelId,
          socketId: socket.id,
        });

        if (branch === 'reject_unknown') {
          log.warn(
            {
              msg: 'echo.socket.message_rejected_unknown_channel',
              correlationId,
              channelId,
              socketId: socket.id,
            },
            'Message targeted a channel that is not persisted',
          );
          log.warn({
            msg: 'echo.socket.message_failed',
            code: 'UNKNOWN_CHANNEL',
            correlationId,
            channelId,
            socketId: socket.id,
          });
          emitMessageFailed(socket, {
            code: 'UNKNOWN_CHANNEL',
            channelId,
            clientMessageId,
            detail: 'Channel is not a persisted Echo channel',
          });
          return;
        }

        let postAccessCtx: EchoPostMessageAccessContext | null = null;

        if (branch === 'echo_persisted') {
          if (!authenticated || isAnonymousSocketUser(userId)) {
            log.warn(
              {
                msg: 'echo.socket.message_rejected_unauthenticated',
                correlationId,
                channelId,
                socketId: socket.id,
              },
              'Message rejected because the socket is not authenticated',
            );
            log.warn({
              msg: 'echo.socket.message_failed',
              code: 'UNAUTHENTICATED',
              correlationId,
              channelId,
              socketId: socket.id,
            });
            emitMessageFailed(socket, {
              code: 'UNAUTHENTICATED',
              channelId,
              clientMessageId,
            });
            return;
          }
          if (!pool) {
            log.error(
              {
                msg: 'echo.socket.message_persist_missing_pool',
                correlationId,
                channelId,
                socketId: socket.id,
              },
              'Echo store pool missing during message persist',
            );
            emitMessageFailed(socket, {
              code: 'PERSIST_FAILED',
              channelId,
              clientMessageId,
            });
            return;
          }
          const postAccess = await evaluateEchoPostMessageAccess(
            pool,
            userId,
            channelId,
          );
          if (!postAccess.ok) {
            echoPermissionDenialReasonTotal.inc({ reason: postAccess.reason });
            const diagnostics = await gatherEchoPostMessageFailureDiagnostics(
              pool,
              {
                userId,
                channelId,
                reason: postAccess.reason,
                correlationId,
              },
            );
            log.warn({
              msg: 'echo.socket.message_failed',
              code: 'FORBIDDEN',
              correlationId,
              channelId,
              userId,
              socketId: socket.id,
              reason: postAccess.reason,
              diagnostics,
            });
            const detailByReason: Record<EchoPostMessageDenialReason, string> =
              {
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
                paper_channel:
                  'Paper channels use the document editor; chat messages are not supported here.',
              };
            emitMessageFailed(socket, {
              code: 'FORBIDDEN',
              channelId,
              clientMessageId,
              detail: detailByReason[postAccess.reason],
              ...(config.echoMessageFailedDiagnosticsToClient
                ? { diagnostics }
                : {}),
            });
            return;
          }
          postAccessCtx = postAccess.ctx;
          const guildServerId =
            postAccessCtx.realm === 'guild' ? postAccessCtx.serverId : null;
          if (
            guildServerId &&
            !(await echoChannelAllowsMessageUnderSlowmode(
              pool,
              guildServerId,
              userId,
              channelId,
            ))
          ) {
            log.warn(
              {
                msg: 'echo.socket.message_rejected_slowmode',
                correlationId,
                channelId,
                userId,
                socketId: socket.id,
              },
              'Message rejected by slowmode',
            );
            log.warn({
              msg: 'echo.socket.message_failed',
              code: 'SLOWMODE',
              correlationId,
              channelId,
              userId,
              socketId: socket.id,
            });
            emitMessageFailed(socket, {
              code: 'SLOWMODE',
              channelId,
              clientMessageId,
              detail: 'Slowmode is active in this channel',
            });
            return;
          }
        }

        if (branch === 'echo_persisted' && pool && postAccessCtx) {
          const guildServerId =
            postAccessCtx.realm === 'guild' ? postAccessCtx.serverId : null;
          if (
            !(await canUserSendMassMentionInChannel(
              pool,
              userId,
              channelId,
              sanitizedMentions,
              { postAccess: postAccessCtx },
            ))
          ) {
            emitMessageFailed(socket, {
              code: 'FORBIDDEN',
              channelId,
              clientMessageId,
              detail:
                'You cannot mention @everyone or @active in this channel.',
            });
            return;
          }
          let bannedWordsEval: Awaited<
            ReturnType<typeof evaluateBannedWordsOnMessageSend>
          > | null = null;
          if (guildServerId) {
            const spamCheck = await checkEchoServerSpamFilter(pool, {
              serverId: guildServerId,
              userId,
              content,
              mentions: sanitizedMentions,
            });
            if (!spamCheck.ok) {
              log.warn({
                msg: 'echo.socket.message_failed',
                code: 'SPAM_FILTER',
                correlationId,
                channelId,
                userId,
                socketId: socket.id,
                detail: spamCheck.detail,
              });
              emitMessageFailed(socket, {
                code: 'SPAM_FILTER',
                channelId,
                clientMessageId,
                detail: spamCheck.detail,
              });
              return;
            }
            bannedWordsEval = await evaluateBannedWordsOnMessageSend(pool, {
              serverId: guildServerId,
              userId,
              content,
            });
            if (bannedWordsEval.shouldBlock) {
              log.warn({
                msg: 'echo.socket.message_failed',
                code: 'BANNED_WORDS_BLOCKED',
                correlationId,
                channelId,
                userId,
                socketId: socket.id,
              });
              emitMessageFailed(socket, {
                code: 'BANNED_WORDS_BLOCKED',
                channelId,
                clientMessageId,
                detail:
                  bannedWordsEval.blockUserDetail ?? 'Blocked by word filter',
              });
              return;
            }
          }
          if (
            pollDef &&
            guildServerId &&
            (await isEchoChannelWithinForumContext(
              pool,
              guildServerId,
              channelId,
            ))
          ) {
            emitMessageFailed(socket, {
              code: 'FORBIDDEN',
              channelId,
              clientMessageId,
              detail: 'Polls are not allowed in forums.',
            });
            return;
          }
          log.debug(
            {
              msg: 'echo.socket.message_persist_start',
              correlationId,
              channelId,
              clientMessageId,
              socketId: socket.id,
              userId,
            },
            'Persisting socket message',
          );
          let forwardedFrom: ForwardedFrom | undefined;
          if (forwardMessageId) {
            const fwdRes = await resolveEchoForwardSnapshot(
              pool,
              userId,
              forwardMessageId,
            );
            if (!fwdRes.ok) {
              emitMessageFailed(socket, {
                code: 'VALIDATION',
                channelId,
                clientMessageId,
                detail: fwdRes.error,
              });
              return;
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
            emitMessageFailed(socket, {
              code: 'VALIDATION',
              channelId,
              clientMessageId,
              detail: 'Message must start with this channel’s format template.',
            });
            return;
          }

          let resolvedStickers: Awaited<
            ReturnType<typeof resolveStickerIdsForChannel>
          > | null = null;
          if (stickerIds?.length) {
            if (postAccessCtx.realm === 'guild') {
              const perms = postAccessCtx.effectiveChannelPermissions;
              if (
                !perms.has('USE_EXTERNAL_STICKERS') &&
                !perms.has('USE_EXPRESSIONS') &&
                !perms.has('ADMINISTRATOR')
              ) {
                emitMessageFailed(socket, {
                  code: 'FORBIDDEN',
                  channelId,
                  clientMessageId,
                  detail:
                    'You do not have permission to use stickers in this channel.',
                });
                return;
              }
            }
            resolvedStickers = await resolveStickerIdsForChannel(
              pool,
              channelId,
              stickerIds,
            );
            if (!resolvedStickers.ok) {
              emitMessageFailed(socket, {
                code: 'VALIDATION',
                channelId,
                clientMessageId,
                detail: resolvedStickers.error,
              });
              return;
            }
          }

          const persistRes = await echoPersistedMessageCreateAndBroadcast(
            pool,
            io,
            log,
            userId,
            {
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
              ...(resolvedStickers?.ok
                ? { stickers: resolvedStickers.stickers }
                : {}),
              ...(contentJson !== undefined ? { contentJson } : {}),
              messageFormatVersion,
              contentSchemaVersion,
              ...(forwardedFrom ? { forwardedFrom } : {}),
            },
          );
          if (!persistRes.ok) {
            log.error(
              {
                msg: 'echo.socket.message_persist_failed',
                correlationId,
                channelId,
                clientMessageId: persistRes.clientMessageId,
                code: persistRes.code,
                detail: persistRes.detail,
                socketId: socket.id,
              },
              'Message persistence failed',
            );
            emitMessageFailed(socket, {
              code: persistRes.code,
              channelId,
              clientMessageId: persistRes.clientMessageId,
              ...(persistRes.detail ? { detail: persistRes.detail } : {}),
            });
            return;
          }
          if (
            persistRes.kind !== 'duplicate_ack' &&
            guildServerId &&
            bannedWordsEval &&
            bannedWordsEval.matches.length > 0 &&
            bannedWordsEval.action
          ) {
            const own = await pool.query(
              `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
              [guildServerId],
            );
            const ownerActorId = own.rows[0]
              ? String(own.rows[0].owner_id)
              : '';
            if (ownerActorId) {
              await applyBannedWordsAfterMessagePersisted(fastify, pool, {
                serverId: guildServerId,
                ownerActorId,
                channelId,
                userId,
                messageId: persistRes.message.id,
                matches: bannedWordsEval.matches,
                action: bannedWordsEval.action,
                log,
              });
            }
          }
          if (persistRes.kind === 'duplicate_ack') {
            log.info(
              {
                msg: 'echo.socket.message_duplicate_ack',
                correlationId,
                channelId,
                clientMessageId: persistRes.message.id,
                socketId: socket.id,
              },
              'Duplicate message ack emitted to sender',
            );
            socket.emit('message_ack', { message: persistRes.message });
            return;
          }
          log.debug(
            {
              msg: 'echo.socket.message_persist_complete',
              correlationId,
              channelId,
              clientMessageId,
              socketId: socket.id,
            },
            'Persisted socket message',
          );
          return;
        }
      } finally {
        endTimer();
      }
    })();
  });
}
