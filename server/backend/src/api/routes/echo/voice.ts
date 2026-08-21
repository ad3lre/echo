import type pg from 'pg';
import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import {
  ECHO_MSG_NOT_SERVER_MEMBER,
  sendEchoChannelAccessDenied,
  sendEchoVoiceJoinDenied,
  sendError,
} from '../../errors';
import {
  applyEchoVoiceModerationAction,
  canUserSpeakInStageChannel,
  cancelEchoStageSpeakRequest,
  getActiveVoiceE2eeEpoch,
  getEchoChannelVoiceE2eeEnabled,
  getMlsGroupInfo,
  userHasVoiceE2eeEnvelopeForJoin,
  insertEchoAudit,
  joinEchoVoiceChannel,
  leaveEchoVoiceChannel,
  listEchoStageSpeakRequests,
  listEchoVoiceParticipants,
  requestEchoStageSpeak,
  resolveEchoStageSpeakRequest,
  getEchoChannelType,
  type EchoVoiceModerationAction,
} from '../../../domain/echoStore';
import {
  diagnoseEchoChannelAccess,
  getEffectiveChannelPermissions,
  isMemberOfServer,
} from '../../../domain/permissions/echoPermissions';
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
  stopLiveKitParticipantCamera,
  stopLiveKitParticipantScreenShare,
  syncLiveKitParticipantPublishPermissions,
} from '../../../services/livekit/livekitAdapter';
import { syncStageProgramRoomMetadata } from '../../../services/stage/stageProgramRoom';
import {
  echoVoiceClientQosJitterMs,
  echoVoiceClientQosLatencyMs,
  echoVoiceClientQosPacketLossPct,
  echoVoiceClientQosSamplesTotal,
  echoVoiceModerateTotal,
} from '../../../observability/echoMetrics';
import { normalizeVoiceQosSample } from '../../../../../../contracts/voiceQosSample';
import { vcTrace } from '../../../observability/voiceTraceLog';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

const ECHO_VOICE_MODERATE_ACTIONS = new Set<string>([
  'disconnect',
  'move',
  'server_mute',
  'server_unmute',
  'server_deafen',
  'server_undeafen',
  'invite_to_speak',
  'move_to_audience',
  'stop_camera',
  'stop_screen_share',
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

/** Refresh stage speaker roster in LiveKit room metadata (egress program template). */
async function trySyncStageProgramRoomMetadata(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  log?: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  if (!config.liveKitEnabled || !channelId.trim()) return;
  try {
    const channelType = await getEchoChannelType(pool, serverId, channelId);
    if (channelType !== 'stage') return;
    await syncStageProgramRoomMetadata(pool, serverId, channelId);
  } catch (e) {
    log?.warn(
      { err: e, serverId, channelId },
      '[LiveKit] sync stage program room metadata failed',
    );
  }
}

async function syncLiveKitStageSpeakerMedia(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  targetUserId: string,
  action: 'invite_to_speak' | 'move_to_audience',
  log: {
    warn: (obj: unknown, msg?: string) => void;
    info: (obj: object, msg?: string) => void;
  },
): Promise<void> {
  if (!config.liveKitEnabled) return;
  const channelType = await getEchoChannelType(pool, serverId, channelId);
  if (channelType !== 'stage') return;
  const roomName = liveKitRoomName(serverId, channelId);
  const speakAllowed = action === 'invite_to_speak';
  try {
    if (!speakAllowed) {
      await stopLiveKitParticipantCamera({ roomName, identity: targetUserId });
      await stopLiveKitParticipantScreenShare({
        roomName,
        identity: targetUserId,
      });
    }
    const modRow = await pool.query(
      `SELECT server_muted, server_deafened FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    const moderationMute =
      modRow.rows[0] != null &&
      (Boolean(modRow.rows[0].server_muted) ||
        Boolean(modRow.rows[0].server_deafened));
    await syncLiveKitParticipantPublishPermissions({
      roomName,
      identity: targetUserId,
      canPublishMicrophone: speakAllowed && !moderationMute,
      canPublishVideo: speakAllowed,
    });
    await syncStageProgramRoomMetadata(pool, serverId, channelId);
  } catch (e) {
    log.warn(
      { err: e, action, targetUserId, channelId },
      '[LiveKit] sync stage speaker media failed',
    );
  }
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
  const stageBlocksMic = channelType === 'stage' && !r.rows[0].stage_speaker;
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
        userId: getAuthUser(req).id,
      });
      const okMem = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
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
        getAuthUser(req).id,
        { membershipAlreadyVerified: true },
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
        getAuthUser(req).id,
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
          userId: getAuthUser(req).id,
          action: 'join',
          ...(r.stageSpeaker !== undefined
            ? { stageSpeaker: r.stageSpeaker }
            : {}),
        },
        auditId,
      );
      if (r.stageSpeaker !== undefined) {
        await trySyncStageProgramRoomMetadata(
          pool,
          serverId,
          channelId,
          req.log,
        );
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body: { e2eeDeviceId?: string };
  }>(
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
        userId: getAuthUser(req).id,
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
        `[LiveKit] session request — user=${getAuthUser(req).id} server=${serverId} channel=${channelId}`,
      );
      const okMem = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
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
        getAuthUser(req).id,
        { membershipAlreadyVerified: true },
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
      const uid = getAuthUser(req).id;
      const logE2eeMintRejected = async (code: string) => {
        // Keep the REST voice-participant row: the client runs MLS / epoch
        // prepare after a 409 and must stay in `echo_voice_participants` for
        // `actorInVoiceChannel` guards on MLS init/commit.
        const auditId = await insertEchoAudit(
          pool,
          serverId,
          uid,
          'voice.join_e2ee_rejected',
          'channel',
          channelId,
          { code },
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
      };
      const modRow = await pool.query(
        `SELECT server_muted, server_deafened FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
        [serverId, uid],
      );
      const moderationMute =
        modRow.rows[0] != null &&
        (Boolean(modRow.rows[0].server_muted) ||
          Boolean(modRow.rows[0].server_deafened));
      const stageSpeakAllowed = await canUserSpeakInStageChannel(
        pool,
        serverId,
        channelId,
        getAuthUser(req).id,
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
      /**
       * MLS (v2, RFC 9420) satisfies the E2EE join requirement: the client
       * creates or externally joins the channel's MLS group during its prepare
       * step (before this mint), and derives media keys from the group's epoch
       * secret — there are no server-distributed envelopes to verify. The
       * legacy v1 epoch/envelope checks below only apply when no MLS group
       * exists for this channel (old clients).
       */
      const mlsGroupActive =
        voiceE2eeRequired &&
        (await getMlsGroupInfo(pool, serverId, channelId)) !== null;
      if (voiceE2eeRequired && !mlsGroupActive) {
        if (!activeEpoch) {
          await logE2eeMintRejected('VOICE_E2EE_EPOCH_REQUIRED');
          return sendError(
            reply,
            409,
            'VOICE_E2EE_EPOCH_REQUIRED',
            'End-to-end encrypted voice requires a call key. Create an epoch before connecting.',
          );
        }
        const isCreator = activeEpoch.createdByUserId === uid;
        if (!isCreator) {
          const e2eeDeviceId =
            typeof req.body?.e2eeDeviceId === 'string'
              ? req.body.e2eeDeviceId.trim()
              : '';
          const hasEnvelope = await userHasVoiceE2eeEnvelopeForJoin(
            pool,
            activeEpoch.id,
            uid,
            e2eeDeviceId || null,
          );
          if (!hasEnvelope) {
            await logE2eeMintRejected('VOICE_E2EE_ENVELOPE_MISSING');
            return sendError(
              reply,
              409,
              'VOICE_E2EE_ENVELOPE_MISSING',
              'No encrypted key material for your account. Wait for the key distributor or refresh.',
            );
          }
        }
      }

      const pfpMeta = pfpForLiveKitParticipantMetadata(
        getAuthUser(req).pfp ?? '',
      );
      const token = await mintJoinToken({
        identity: getAuthUser(req).id,
        name: getAuthUser(req).username ?? getAuthUser(req).id,
        roomName,
        canPublishMicrophone: !blockMic,
        canPublishVideo: stageSpeakAllowed,
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
        getAuthUser(req).id,
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
        { channelId, userId: getAuthUser(req).id, action: 'join' },
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

  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body: { latencyMs?: number; jitterMs?: number; packetLossPct?: number };
  }>(
    '/servers/:serverId/channels/:channelId/voice/qos-sample',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 4,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      if (!config.liveKitEnabled) {
        return reply.code(204).send();
      }
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const okMem = await isMemberOfServer(
        echoPool(req),
        serverId,
        getAuthUser(req).id,
      );
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const sample = normalizeVoiceQosSample(req.body);
      if (!sample) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Expected latencyMs, jitterMs, and packetLossPct numbers.',
        );
      }
      echoVoiceClientQosLatencyMs.observe(sample.latencyMs);
      echoVoiceClientQosJitterMs.observe(sample.jitterMs);
      echoVoiceClientQosPacketLossPct.observe(sample.packetLossPct);
      echoVoiceClientQosSamplesTotal.inc();
      return reply.code(204).send();
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
        userId: getAuthUser(req).id,
      });
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
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
        [sid, getAuthUser(req).id],
      );
      const leaveChannelId = leaveChannelRow.rows[0]?.channel_id
        ? String(leaveChannelRow.rows[0].channel_id)
        : '';

      await leaveEchoVoiceChannel(pool, sid, getAuthUser(req).id);
      vcTrace(req.log, 'voice.leave:ok', {
        serverId: sid,
        userId: getAuthUser(req).id,
      });
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'voice.leave',
        'user',
        getAuthUser(req).id,
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
          userId: getAuthUser(req).id,
          action: 'leave',
        },
        auditId,
      );
      if (leaveChannelId) {
        await trySyncStageProgramRoomMetadata(
          pool,
          sid,
          leaveChannelId,
          req.log,
        );
      }
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
      const okMem = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
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
      const access = await diagnoseEchoChannelAccess(
        pool,
        getAuthUser(req).id,
        channelId,
      );
      if (!access.ok) {
        vcTrace(req.log, 'voice.participants:channel_forbidden', {
          serverId,
          channelId,
        });
        return sendEchoChannelAccessDenied(reply, access);
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
        moderatorId: getAuthUser(req).id,
        actionRaw:
          typeof req.body?.action === 'string' ? req.body.action.trim() : '',
        hasTargetUserId:
          typeof req.body?.targetUserId === 'string' &&
          !!req.body.targetUserId.trim(),
        hasTargetChannelId: typeof req.body?.targetChannelId === 'string',
      });
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
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
        getAuthUser(req).id,
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
        (action === 'disconnect' || action === 'move') &&
        liveKitChannelIdForKick &&
        config.liveKitEnabled
      ) {
        const roomName = liveKitRoomName(sid, liveKitChannelIdForKick);
        vcTrace(req.log, 'voice.moderate:livekit_remove_participant', {
          action,
          roomName,
          targetUserId,
        });
        try {
          await removeLiveKitParticipant(roomName, targetUserId);
        } catch (e) {
          vcTrace(req.log, 'voice.moderate:livekit_remove_participant_error', {
            action,
            roomName,
            err: e instanceof Error ? e.message : String(e),
          });
          req.log.warn(
            { err: e, action, roomName, targetUserId },
            '[LiveKit] removeParticipant after voice moderation failed',
          );
        }
        await trySyncStageProgramRoomMetadata(
          pool,
          sid,
          liveKitChannelIdForKick,
          req.log,
        );
        if (action === 'move' && targetChannelId) {
          await trySyncStageProgramRoomMetadata(
            pool,
            sid,
            targetChannelId,
            req.log,
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
      if (
        r === 'ok' &&
        config.liveKitEnabled &&
        modCurrentChannelId &&
        (action === 'invite_to_speak' || action === 'move_to_audience')
      ) {
        await syncLiveKitStageSpeakerMedia(
          pool,
          sid,
          modCurrentChannelId,
          targetUserId,
          action,
          req.log,
        );
      }
      if (
        r === 'ok' &&
        config.liveKitEnabled &&
        modCurrentChannelId &&
        (action === 'stop_camera' || action === 'stop_screen_share')
      ) {
        const roomName = liveKitRoomName(sid, modCurrentChannelId);
        vcTrace(req.log, 'voice.moderate:sync_livekit_media', {
          action,
          targetUserId,
          roomName,
        });
        try {
          if (action === 'stop_camera') {
            await stopLiveKitParticipantCamera({
              roomName,
              identity: targetUserId,
            });
          } else {
            await stopLiveKitParticipantScreenShare({
              roomName,
              identity: targetUserId,
            });
          }
        } catch (e) {
          vcTrace(req.log, 'voice.moderate:sync_livekit_media_error', {
            action,
            targetUserId,
            err: e instanceof Error ? e.message : String(e),
          });
          req.log.warn(
            { err: e },
            '[LiveKit] stop camera/screen share after voice moderate failed',
          );
        }
      }
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
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
      } else if (action === 'stop_camera') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'stop_camera',
          },
          auditId,
        );
      } else if (action === 'stop_screen_share') {
        publishVoiceRosterDelta(
          fastify,
          sid,
          {
            channelId: modCurrentChannelId ?? '',
            userId: targetUserId,
            action: 'stop_screen_share',
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
      const okMem = await isMemberOfServer(pool, serverId, getAuthUser(req).id);
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
        getAuthUser(req).id,
      );
      if (r === 'ok') return reply.code(204).send();
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to request to speak',
        );
      if (r === 'already_speaker')
        return sendError(
          reply,
          409,
          'ALREADY_SPEAKER',
          'You are already a speaker',
        );
      if (r === 'already_requested')
        return sendError(
          reply,
          409,
          'ALREADY_REQUESTED',
          'Request already pending',
        );
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
        getAuthUser(req).id,
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
      const uid = getAuthUser(req).id;
      const okMem = await isMemberOfServer(pool, serverId, uid);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      if ((await getEchoChannelType(pool, serverId, channelId)) !== 'stage') {
        return sendError(reply, 404, 'NOT_FOUND', 'Stage channel not found');
      }
      const perms = await getEffectiveChannelPermissions(
        pool,
        serverId,
        uid,
        channelId,
      );
      if (!perms.has('MUTE_MEMBERS')) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to manage stage speak requests',
        );
      }
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
        getAuthUser(req).id,
        targetUserId,
        approve,
      );
      if (r === 'ok') {
        if (approve) {
          const auditId = await insertEchoAudit(
            pool,
            serverId,
            getAuthUser(req).id,
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
          if (config.liveKitEnabled) {
            await syncLiveKitMicAfterServerModeration(
              pool,
              serverId,
              targetUserId,
              req.log,
            );
            await syncLiveKitStageSpeakerMedia(
              pool,
              serverId,
              channelId,
              targetUserId,
              'invite_to_speak',
              req.log,
            );
          }
        }
        return reply.code(204).send();
      }
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to moderate stage',
        );
      return sendError(reply, 404, 'NOT_FOUND', 'Request not found');
    },
  );
}
