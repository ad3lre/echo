import type pg from 'pg';
import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import {
  ECHO_MSG_NOT_SERVER_MEMBER,
  sendEchoVoiceJoinDenied,
  sendError,
} from '../../errors';
import {
  applyEchoVoiceModerationAction,
  canUserSpeakInStageChannel,
  cancelEchoStageSpeakRequest,
  getActiveVoiceE2eeEpoch,
  getEchoChannelVoiceE2eeEnabled,
  insertEchoAudit,
  joinEchoVoiceChannel,
  leaveEchoVoiceChannel,
  listEchoStageSpeakRequests,
  listEchoVoiceParticipants,
  requestEchoStageSpeak,
  resolveEchoStageSpeakRequest,
  type EchoVoiceModerationAction,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import {
  publishEchoWorkspaceEvent,
  publishVoiceRosterDelta,
} from '../../../platform/echoPlatformEvents';
import { config } from '../../../config';
import {
  liveKitRoomName,
  mintJoinToken,
  pfpForLiveKitParticipantMetadata,
  removeLiveKitParticipant,
  setLiveKitParticipantMicrophoneMuted,
} from '../../../services/livekit/livekitAdapter';
import { echoVoiceModerateTotal } from '../../../observability/echoMetrics';
import { vcTrace } from '../../../observability/voiceTraceLog';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const ECHO_VOICE_MODERATE_ACTIONS = new Set<string>([
  'disconnect',
  'move',
  'server_mute',
  'server_unmute',
  'server_deafen',
  'server_undeafen',
  'invite_to_speak',
  'move_to_audience',
]);

function voiceReadRateLimitKey(req: FastifyRequest): string {
  return req.authUser?.id ? `uid:${req.authUser.id}` : `ip:${req.ip}`;
}

function parseEchoVoiceModerateAction(
  raw: string,
): EchoVoiceModerationAction | null {
  return ECHO_VOICE_MODERATE_ACTIONS.has(raw)
    ? (raw as EchoVoiceModerationAction)
    : null;
}

async function syncLiveKitMicAfterServerModeration(
  pool: pg.Pool,
  serverId: string,
  targetUserId: string,
  log: {
    warn: (obj: unknown, msg?: string) => void;
    info: (obj: object, msg?: string) => void;
  },
): Promise<void> {
  vcTrace(log, 'syncLiveKitMicAfterServerModeration:start', {
    serverId,
    targetUserId,
    liveKitEnabled: config.liveKitEnabled,
  });
  if (!config.liveKitEnabled) return;
  const r = await pool.query(
    `SELECT vp.channel_id, vp.server_muted, vp.server_deafened, vp.stage_speaker, ch.type AS channel_type
     FROM echo_voice_participants vp
     JOIN echo_channels ch ON ch.id = vp.channel_id AND ch.server_id = vp.server_id
     WHERE vp.server_id = $1 AND vp.user_id = $2`,
    [serverId, targetUserId],
  );
  if (!r.rows[0]) {
    vcTrace(log, 'syncLiveKitMicAfterServerModeration:no_row', {
      serverId,
      targetUserId,
    });
    return;
  }
  const cid = String(r.rows[0].channel_id);
  const channelType = String(r.rows[0].channel_type ?? '');
  const stageBlocksMic =
    channelType === 'stage' && !Boolean(r.rows[0].stage_speaker);
  const mute =
    Boolean(r.rows[0].server_muted) ||
    Boolean(r.rows[0].server_deafened) ||
    stageBlocksMic;
  vcTrace(log, 'syncLiveKitMicAfterServerModeration:db_state', {
    serverId,
    channelId: cid,
    targetUserId,
    serverMuted: Boolean(r.rows[0].server_muted),
    serverDeafened: Boolean(r.rows[0].server_deafened),
    muteMicInLiveKit: mute,
    roomName: liveKitRoomName(serverId, cid),
  });
  try {
    await setLiveKitParticipantMicrophoneMuted({
      roomName: liveKitRoomName(serverId, cid),
      identity: targetUserId,
      muted: mute,
    });
    vcTrace(log, 'syncLiveKitMicAfterServerModeration:ok', {
      roomName: liveKitRoomName(serverId, cid),
      targetUserId,
    });
  } catch (e) {
    vcTrace(log, 'syncLiveKitMicAfterServerModeration:error', {
      roomName: liveKitRoomName(serverId, cid),
      targetUserId,
      err: e instanceof Error ? e.message : String(e),
    });
    log.warn(
      { err: e },
      '[LiveKit] sync mic mute after server moderation failed',
    );
  }
}

export default async function echoVoiceRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/join',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      vcTrace(req.log, 'voice.join:request', {
        serverId,
        channelId,
        userId: req.authUser!.id,
      });
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        vcTrace(req.log, 'voice.join:forbidden_not_member', { serverId });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const r = await joinEchoVoiceChannel(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      if (!r.ok) {
        if (r.reason === 'not_found')
          vcTrace(req.log, 'voice.join:not_found', { serverId, channelId });
        else if (r.reason === 'full')
          vcTrace(req.log, 'voice.join:full', { serverId, channelId });
        else
          vcTrace(req.log, 'voice.join:forbidden_channel', {
            serverId,
            channelId,
            reason: r.reason,
          });
        return sendEchoVoiceJoinDenied(reply, r);
      }
      vcTrace(req.log, 'voice.join:ok', { serverId, channelId });
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        req.authUser!.id,
        'voice.join',
        'channel',
        channelId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId,
        },
        { serverId },
      );
      publishVoiceRosterDelta(
        fastify,
        serverId,
        {
          channelId,
          userId: req.authUser!.id,
          action: 'join',
          ...(r.stageSpeaker !== undefined
            ? { stageSpeaker: r.stageSpeaker }
            : {}),
        },
        auditId,
      );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/livekit-session',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      vcTrace(req.log, 'voice.livekit_session:request', {
        serverId,
        channelId,
        userId: req.authUser!.id,
        liveKitEnabled: config.liveKitEnabled,
      });
      if (!config.liveKitEnabled) {
        vcTrace(req.log, 'voice.livekit_session:not_configured', {});
        req.log.warn(
          '[LiveKit] livekit-session called but LiveKit is NOT enabled (missing env vars)',
        );
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Voice infrastructure is not configured',
        );
      }
      req.log.info(
        `[LiveKit] session request — user=${req.authUser!.id} server=${serverId} channel=${channelId}`,
      );
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        vcTrace(req.log, 'voice.livekit_session:forbidden_not_member', {
          serverId,
        });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const r = await joinEchoVoiceChannel(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      if (!r.ok) {
        if (r.reason === 'not_found')
          vcTrace(req.log, 'voice.livekit_session:not_found', {
            serverId,
            channelId,
          });
        else if (r.reason === 'full')
          vcTrace(req.log, 'voice.livekit_session:full', {
            serverId,
            channelId,
          });
        else
          vcTrace(req.log, 'voice.livekit_session:forbidden_channel', {
            serverId,
            channelId,
            reason: r.reason,
          });
        return sendEchoVoiceJoinDenied(reply, r);
      }
      const roomName = liveKitRoomName(serverId, channelId);
      const modRow = await pool.query(
        `SELECT server_muted, server_deafened FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
        [serverId, req.authUser!.id],
      );
      const moderationMute =
        modRow.rows[0] != null &&
        (Boolean(modRow.rows[0].server_muted) ||
          Boolean(modRow.rows[0].server_deafened));
      const stageSpeakAllowed = await canUserSpeakInStageChannel(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      const blockMic = moderationMute || !stageSpeakAllowed;
      vcTrace(req.log, 'voice.livekit_session:moderation_row', {
        roomName,
        hasParticipantRow: modRow.rows[0] != null,
        blockMic,
        serverMuted: modRow.rows[0]
          ? Boolean(modRow.rows[0].server_muted)
          : false,
        serverDeafened: modRow.rows[0]
          ? Boolean(modRow.rows[0].server_deafened)
          : false,
      });
      const voiceE2eeRequired = await getEchoChannelVoiceE2eeEnabled(
        pool,
        serverId,
        channelId,
      );
      const activeEpoch = voiceE2eeRequired
        ? await getActiveVoiceE2eeEpoch(pool, serverId, channelId)
        : null;
      if (voiceE2eeRequired) {
        if (!activeEpoch) {
          return sendError(
            reply,
            409,
            'VOICE_E2EE_EPOCH_REQUIRED',
            'End-to-end encrypted voice requires a call key. Create an epoch before connecting.',
          );
        }
        const uid = req.authUser!.id;
        const isCreator = activeEpoch.createdByUserId === uid;
        if (!isCreator) {
          const mine = await pool.query(
            `SELECT 1 FROM echo_voice_e2ee_envelopes WHERE epoch_id = $1 AND recipient_user_id = $2 LIMIT 1`,
            [activeEpoch.id, uid],
          );
          if (mine.rows.length === 0) {
            return sendError(
              reply,
              409,
              'VOICE_E2EE_ENVELOPE_MISSING',
              'No encrypted key material for your account. Wait for the key distributor or refresh.',
            );
          }
        }
      }

      const pfpMeta = pfpForLiveKitParticipantMetadata(req.authUser!.pfp ?? '');
      const token = await mintJoinToken({
        identity: req.authUser!.id,
        name: req.authUser!.username ?? req.authUser!.id,
        roomName,
        canPublishMicrophone: !blockMic,
        ...(pfpMeta ? { metadata: JSON.stringify({ pfp: pfpMeta }) } : {}),
      });

      const channelRow = await pool.query<{
        bitrate_bps: number | null;
      }>(`SELECT bitrate_bps FROM echo_channels WHERE id = $1`, [channelId]);
      const bitrateBps: number | null = channelRow.rows[0]?.bitrate_bps ?? null;

      vcTrace(req.log, 'voice.livekit_session:response', {
        roomName,
        hasToken: !!token,
        ttlSec: config.liveKitJoinTokenTtlSec,
        bitrateBps,
        liveKitPublicUrlHost: config.liveKitPublicUrl
          .replace(/^wss?:\/\//, '')
          .split('/')[0],
      });
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        req.authUser!.id,
        'voice.join',
        'channel',
        channelId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId,
        },
        { serverId },
      );
      publishVoiceRosterDelta(
        fastify,
        serverId,
        { channelId, userId: req.authUser!.id, action: 'join' },
        auditId,
      );
      return reply.code(200).send({
        url: config.liveKitPublicUrl,
        token,
        roomName,
        bitrateBps,
        voiceE2ee: {
          required: voiceE2eeRequired,
          epochId: voiceE2eeRequired ? (activeEpoch?.id ?? null) : null,
        },
      });
    },
  );

  fastify.post<{ Params: { serverId: string } }>(
    '/servers/:serverId/voice/leave',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      vcTrace(req.log, 'voice.leave:request', {
        serverId: sid,
        userId: req.authUser!.id,
      });
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        vcTrace(req.log, 'voice.leave:forbidden', { serverId: sid });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      // Capture current channel before the delete so the roster delta can reference it.
      const leaveChannelRow = await pool.query(
        `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
        [sid, req.authUser!.id],
      );
      const leaveChannelId = leaveChannelRow.rows[0]?.channel_id
        ? String(leaveChannelRow.rows[0].channel_id)
        : '';

      await leaveEchoVoiceChannel(pool, sid, req.authUser!.id);
      vcTrace(req.log, 'voice.leave:ok', {
        serverId: sid,
        userId: req.authUser!.id,
      });
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'voice.leave',
        'user',
        req.authUser!.id,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      publishVoiceRosterDelta(
        fastify,
        sid,
        {
          channelId: leaveChannelId,
          userId: req.authUser!.id,
          action: 'leave',
        },
        auditId,
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/voice/participants',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 40,
          timeWindow: '1 minute',
          keyGenerator: voiceReadRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      vcTrace(req.log, 'voice.participants:request', { serverId, channelId });
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        vcTrace(req.log, 'voice.participants:forbidden', { serverId });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const participants = await listEchoVoiceParticipants(
        pool,
        serverId,
        channelId,
      );
      vcTrace(req.log, 'voice.participants:ok', {
        serverId,
        channelId,
        count: participants.length,
      });
      return reply.code(200).send({ participants });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { action?: string; targetUserId?: string; targetChannelId?: string };
  }>(
    '/servers/:serverId/voice/moderate',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      vcTrace(req.log, 'voice.moderate:request', {
        serverId: sid,
        moderatorId: req.authUser!.id,
        actionRaw:
          typeof req.body?.action === 'string' ? req.body.action.trim() : '',
        hasTargetUserId:
          typeof req.body?.targetUserId === 'string' &&
          !!req.body.targetUserId.trim(),
        hasTargetChannelId: typeof req.body?.targetChannelId === 'string',
      });
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem) {
        vcTrace(req.log, 'voice.moderate:forbidden_not_member', {
          serverId: sid,
        });
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const actionRaw =
        typeof req.body?.action === 'string' ? req.body.action.trim() : '';
      const targetUserId =
        typeof req.body?.targetUserId === 'string'
          ? req.body.targetUserId.trim()
          : '';
      const targetChannelId =
        typeof req.body?.targetChannelId === 'string'
          ? req.body.targetChannelId.trim()
          : undefined;
      if (!actionRaw || !targetUserId) {
        vcTrace(req.log, 'voice.moderate:invalid_body', {});
        echoVoiceModerateTotal.labels('none', 'invalid_body').inc();
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'action and targetUserId required',
        );
      }
      const action = parseEchoVoiceModerateAction(actionRaw);
      if (!action) {
        vcTrace(req.log, 'voice.moderate:invalid_action', { actionRaw });
        echoVoiceModerateTotal.labels(actionRaw, 'invalid_action').inc();
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid voice moderation action',
        );
      }
      // Query current channel for all actions — needed for roster delta and LK kick.
      const modCurrentChannelRow = await pool.query(
        `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
        [sid, targetUserId],
      );
      const modCurrentChannelId = modCurrentChannelRow.rows[0]?.channel_id
        ? String(modCurrentChannelRow.rows[0].channel_id)
        : null;

      let liveKitChannelIdForKick: string | null = null;
      if (
        (action === 'disconnect' || action === 'move') &&
        config.liveKitEnabled
      ) {
        liveKitChannelIdForKick = modCurrentChannelId;
      }
      const r = await applyEchoVoiceModerationAction(
        pool,
        sid,
        req.authUser!.id,
        action,
        targetUserId,
        targetChannelId,
      );
      vcTrace(req.log, 'voice.moderate:apply_result', {
        action,
        result: r,
        targetUserId,
        targetChannelId: targetChannelId ?? null,
        liveKitChannelIdForKick,
      });
      if (r === 'forbidden') {
        echoVoiceModerateTotal.labels(action, 'forbidden').inc();
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot moderate this member',
        );
      }
      if (r === 'not_found') {
        vcTrace(req.log, 'voice.moderate:not_found', { action });
        echoVoiceModerateTotal.labels(action, 'not_found').inc();
        const isServerState =
          action === 'server_mute' ||
          action === 'server_unmute' ||
          action === 'server_deafen' ||
          action === 'server_undeafen';
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          isServerState
            ? 'User is not in a voice channel'
            : 'Channel not found',
        );
      }
      if (r === 'invalid_body') {
        vcTrace(req.log, 'voice.moderate:invalid_body_move', { action });
        echoVoiceModerateTotal.labels(action, 'invalid_body').inc();
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'targetChannelId required for move',
        );
      }
      if (
        r === 'ok' &&
        action === 'disconnect' &&
        liveKitChannelIdForKick &&
        config.liveKitEnabled
      ) {
        const roomName = liveKitRoomName(sid, liveKitChannelIdForKick);
        vcTrace(req.log, 'voice.moderate:livekit_disconnect', {
          roomName,
          targetUserId,
        });
        try {
          await removeLiveKitParticipant(roomName, targetUserId);
        } catch (e) {
          vcTrace(req.log, 'voice.moderate:livekit_disconnect_error', {
            roomName,
            err: e instanceof Error ? e.message : String(e),
          });
          req.log.warn(
            { err: e },
            '[LiveKit] removeParticipant after voice moderate disconnect failed',
          );
        }
      }
      if (
        r === 'ok' &&
        (action === 'server_mute' ||
          action === 'server_unmute' ||
          action === 'server_deafen' ||
          action === 'server_undeafen' ||
          action === 'invite_to_speak' ||
          action === 'move_to_audience')
      ) {
        vcTrace(req.log, 'voice.moderate:sync_livekit_mic', {
          action,
          targetUserId,
        });
        await syncLiveKitMicAfterServerModeration(
          pool,
          sid,
          targetUserId,
          req.log,
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        `voice.${action}`,
        'user',
        targetUserId,
        {
          targetChannelId: targetChannelId ?? null,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      // Emit a targeted voice roster delta so sidebars update without waiting
      // for the debounced full workspace refetch (tier-1 optimistic fast path).
      if (action === 'disconnect') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'disconnect',
          },
          auditId,
        );
      } else if (action === 'move' && targetChannelId) {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: targetChannelId,
            userId: targetUserId,
            action: 'move',
            fromChannelId: modCurrentChannelId ?? undefined,
          },
          auditId,
        );
      } else if (action === 'server_mute') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'mute',
            serverMuted: true,
          },
          auditId,
        );
      } else if (action === 'server_unmute') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'unmute',
            serverMuted: false,
          },
          auditId,
        );
      } else if (action === 'server_deafen') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'deafen',
            serverDeafened: true,
          },
          auditId,
        );
      } else if (action === 'server_undeafen') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'undeafen',
            serverDeafened: false,
          },
          auditId,
        );
      } else if (action === 'invite_to_speak') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'promote_speaker',
            stageSpeaker: true,
          },
          auditId,
        );
      } else if (action === 'move_to_audience') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'demote_speaker',
            stageSpeaker: false,
          },
          auditId,
        );
      }
      echoVoiceModerateTotal.labels(action, 'ok').inc();
      vcTrace(req.log, 'voice.moderate:ok', { action, targetUserId });
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/stage/request-speak',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const r = await requestEchoStageSpeak(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      if (r === 'ok') return reply.code(204).send();
      if (r === 'forbidden')
        return sendError(reply, 403, 'FORBIDDEN', 'Not allowed to request to speak');
      if (r === 'already_speaker')
        return sendError(reply, 409, 'ALREADY_SPEAKER', 'You are already a speaker');
      if (r === 'already_requested')
        return sendError(reply, 409, 'ALREADY_REQUESTED', 'Request already pending');
      return sendError(reply, 404, 'NOT_FOUND', 'Not in this stage channel');
    },
  );

  fastify.delete<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/stage/request-speak',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const r = await cancelEchoStageSpeakRequest(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      if (r === 'ok') return reply.code(204).send();
      return sendError(reply, 404, 'NOT_FOUND', 'No pending request');
    },
  );

  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/stage/speak-requests',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userIds = await listEchoStageSpeakRequests(
        pool,
        serverId,
        channelId,
      );
      return reply.send({ userIds });
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string; userId: string };
    Body: { approve?: boolean };
  }>(
    '/servers/:serverId/channels/:channelId/stage/speak-requests/:userId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const targetUserId = trimEchoPathParam(req.params.userId);
      const approve = req.body?.approve !== false;
      const r = await resolveEchoStageSpeakRequest(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
        targetUserId,
        approve,
      );
      if (r === 'ok') {
        if (approve) {
          const auditId = await insertEchoAudit(
            pool,
            serverId,
            req.authUser!.id,
            'stage.approve_speak_request',
            'user',
            targetUserId,
            { channelId },
          );
          publishVoiceRosterDelta(
            fastify,
            serverId,
            {
              channelId,
              userId: targetUserId,
              action: 'promote_speaker',
              stageSpeaker: true,
            },
            auditId,
          );
        }
        return reply.code(204).send();
      }
      if (r === 'forbidden')
        return sendError(reply, 403, 'FORBIDDEN', 'Not allowed to moderate stage');
      return sendError(reply, 404, 'NOT_FOUND', 'Request not found');
    },
  );
}
