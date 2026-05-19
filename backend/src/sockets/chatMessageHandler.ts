import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { Socket, Server } from 'socket.io';
import type { ForwardedFrom, MessageFailedCode } from '../../../shared/types';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';
import { validateMessagePayload } from './messageValidation';
import { config } from '../config';
import {
  canUserSendMassMentionInChannel,
  diagnoseEchoPostMessageDenial,
  gatherEchoPostMessageFailureDiagnostics,
  type EchoPostMessageDenialReason,
} from '../domain/echoPermissions';
import { getAuthStore } from '../auth/store';
import {
  checkEchoServerSpamFilter,
  echoChannelAllowsMessageUnderSlowmode,
  echoChannelExistsInDb,
  echoSendPlainTextViolatesHardFormat,
  getEchoChannelServerId,
  isEchoE2eeThreadEnabled,
  isEchoChannelWithinForumContext,
  getEchoStore,
  assertEchoE2eeDeviceOwned,
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
import { evaluateAutomodOnMessageSend } from '../domain/echoStore/automod/messageEval';
import {
  applyAutomodAfterMessagePersisted,
  recordAutomodBlockHits,
} from '../services/echoAutomodApply';
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
          contentJson,
          messageFormatVersion,
          contentSchemaVersion,
          forwardMessageId,
          e2eeEnvelope,
          e2eeCiphertext,
          e2eeSenderDeviceId,
          e2eeEncryptionVersion,
        } = parsed.value;
        const correlationId =
          correlationIdFromPayload ?? options.handshakeCorrelationId;

        const payloadIsE2ee =
          typeof e2eeCiphertext === 'string' &&
          e2eeCiphertext.trim().length > 0;

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
                blockGuestWritesForIpGuest(clientIpFromSocket(socket), userId);
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
            if (isGuestWriteComboBlocked(clientIpFromSocket(socket), userId)) {
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

        log.info({
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

        if (enabled && pool) {
          const threadE2eeEnabled = await isEchoE2eeThreadEnabled(
            pool,
            channelId,
          );
          if (threadE2eeEnabled && !payloadIsE2ee) {
            emitMessageFailed(socket, {
              code: 'VALIDATION',
              channelId: rawChannelId,
              clientMessageId: rawClientId,
              detail:
                'E2EE is enabled for this thread. Send an encrypted message payload.',
            });
            return;
          }
          if (!threadE2eeEnabled && payloadIsE2ee) {
            emitMessageFailed(socket, {
              code: 'VALIDATION',
              channelId: rawChannelId,
              clientMessageId: rawClientId,
              detail: 'E2EE is not enabled for this thread.',
            });
            return;
          }
          if (payloadIsE2ee && e2eeSenderDeviceId) {
            const own = await assertEchoE2eeDeviceOwned(
              pool,
              userId,
              e2eeSenderDeviceId,
            );
            if (own !== 'ok') {
              emitMessageFailed(socket, {
                code:
                  own === 'revoked'
                    ? 'E2EE_DEVICE_REVOKED'
                    : 'E2EE_UNKNOWN_DEVICE',
                channelId: rawChannelId,
                clientMessageId: rawClientId,
                detail:
                  own === 'revoked'
                    ? 'This E2EE device was revoked.'
                    : 'Unknown E2EE device for this account.',
              });
              return;
            }
          }
        }

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
            log.warn({
              msg: 'echo.socket.message_failed',
              code: 'FORBIDDEN',
              correlationId,
              channelId,
              userId,
              socketId: socket.id,
              reason: postDiag.reason,
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
              };
            emitMessageFailed(socket, {
              code: 'FORBIDDEN',
              channelId,
              clientMessageId,
              detail: detailByReason[postDiag.reason],
              ...(config.echoMessageFailedDiagnosticsToClient
                ? { diagnostics }
                : {}),
            });
            return;
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

        if (branch === 'echo_persisted' && pool) {
          if (
            !(await canUserSendMassMentionInChannel(
              pool,
              userId,
              channelId,
              sanitizedMentions,
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
          const sidForSpam = await getEchoChannelServerId(pool, channelId);
          let automodEval: Awaited<
            ReturnType<typeof evaluateAutomodOnMessageSend>
          > | null = null;
          if (sidForSpam) {
            const spamCheck = await checkEchoServerSpamFilter(pool, {
              serverId: sidForSpam,
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
            automodEval = await evaluateAutomodOnMessageSend(pool, {
              serverId: sidForSpam,
              channelId,
              userId,
              content,
              mentionCount: sanitizedMentions?.length ?? 0,
              correlationId,
            });
            if (automodEval.shouldBlock) {
              const own = await pool.query(
                `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
                [sidForSpam],
              );
              const ownerActorId = own.rows[0]
                ? String(own.rows[0].owner_id)
                : '';
              if (ownerActorId) {
                await recordAutomodBlockHits(pool, {
                  serverId: sidForSpam,
                  ownerActorId,
                  channelId,
                  userId,
                  correlationId: automodEval.correlationId,
                  firedRules: automodEval.firedRules,
                  log,
                });
              }
              log.warn({
                msg: 'echo.socket.message_failed',
                code: 'AUTOMOD_BLOCKED',
                correlationId,
                channelId,
                userId,
                socketId: socket.id,
              });
              emitMessageFailed(socket, {
                code: 'AUTOMOD_BLOCKED',
                channelId,
                clientMessageId,
                detail:
                  automodEval.blockUserDetail ?? 'Blocked by AutoMod',
              });
              return;
            }
          }
          if (
            pollDef &&
            sidForSpam &&
            (await isEchoChannelWithinForumContext(pool, sidForSpam, channelId))
          ) {
            emitMessageFailed(socket, {
              code: 'FORBIDDEN',
              channelId,
              clientMessageId,
              detail: 'Polls are not allowed in forums.',
            });
            return;
          }
          log.info(
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
              detail:
                'Message must start with this channel’s format template.',
            });
            return;
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
            sidForSpam &&
            automodEval &&
            automodEval.firedRules.length > 0
          ) {
            const own = await pool.query(
              `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
              [sidForSpam],
            );
            const ownerActorId = own.rows[0]
              ? String(own.rows[0].owner_id)
              : '';
            if (ownerActorId) {
              await applyAutomodAfterMessagePersisted(fastify, pool, {
                serverId: sidForSpam,
                ownerActorId,
                channelId,
                userId,
                messageId: persistRes.message.id,
                correlationId: automodEval.correlationId,
                firedRules: automodEval.firedRules,
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
          log.info(
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
