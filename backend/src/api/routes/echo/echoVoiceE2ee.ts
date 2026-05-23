import type pg from 'pg';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
} from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  createVoiceE2eeEpochWithEnvelopes,
  listEchoDmParticipantUserIds,
  listVoiceE2eeEnvelopesForUser,
  type CreateVoiceE2eeEpochResult,
  type EchoVoiceE2eeEnvelopeInput,
} from '../../../domain/echoStore';
import { ECHO_DM_REALM_SERVER_ID } from '../../../domain/echoStore/dmThreads';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

const E2EE_EPOCH_RATE = {
  max: 30,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

function sendVoiceE2eeEpochCreateError(
  reply: FastifyReply,
  result: CreateVoiceE2eeEpochResult,
): ReturnType<typeof sendError> | null {
  switch (result) {
    case 'ok':
      return null;
    case 'forbidden':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Cannot create voice E2EE epoch.',
      );
    case 'e2ee_disabled':
      return sendError(
        reply,
        403,
        'VOICE_E2EE_DISABLED',
        'Voice E2EE is not enabled for this context.',
      );
    case 'not_in_voice':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Join the voice channel before distributing encrypted call keys.',
      );
    case 'recipient_forbidden':
      return sendError(
        reply,
        403,
        'VOICE_E2EE_RECIPIENT_FORBIDDEN',
        'One or more participants cannot receive encrypted key material.',
      );
    case 'invalid_body':
      return sendError(reply, 400, 'INVALID_BODY', 'Invalid envelope payload.');
    case 'bad_epoch_id':
      return sendError(reply, 400, 'INVALID_BODY', 'epochId must be a UUID.');
    case 'too_many_envelopes':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Too many envelopes for one epoch (device limit).',
      );
    case 'device_invalid':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Unknown or revoked E2EE device for a recipient.',
      );
    case 'infra_missing':
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage is not available on this server.',
      );
    case 'epoch_id_conflict':
      return sendError(
        reply,
        409,
        'VOICE_E2EE_EPOCH_ID_CONFLICT',
        'This epoch id was already used. Generate a new epoch id and retry.',
      );
    case 'active_epoch_conflict':
      return sendError(
        reply,
        409,
        'VOICE_E2EE_ACTIVE_EPOCH_CONFLICT',
        'Another active call key was created for this channel. Refresh and retry.',
      );
    default:
      return sendError(
        reply,
        500,
        'INTERNAL',
        'Voice E2EE epoch create failed.',
      );
  }
}

/** Tell clients to re-run E2EE prepare when a new epoch supersedes shared keys. */
async function publishVoiceE2eeEpochSupersededForVcPeers(
  fastify: FastifyInstance,
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  actorUserId: string,
): Promise<void> {
  let notify = false;
  if (serverId === ECHO_DM_REALM_SERVER_ID) {
    const members = await listEchoDmParticipantUserIds(pool, channelId);
    notify = members.filter((id) => id !== actorUserId).length > 0;
  } else {
    const others = await pool.query(
      `SELECT 1 FROM echo_voice_participants
       WHERE server_id = $1 AND channel_id = $2 AND user_id <> $3
       LIMIT 1`,
      [serverId, channelId, actorUserId],
    );
    notify = others.rows.length > 0;
  }
  if (!notify) return;
  publishEchoWorkspaceEvent(
    fastify,
    {
      kind: 'voice_e2ee_epoch_superseded',
      version: nextEchoSnowflakeId(),
      serverId,
      voiceChannelId: channelId,
    },
    { serverId },
  );
}

function parseEnvelopeInputs(
  raw: unknown,
): EchoVoiceE2eeEnvelopeInput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: EchoVoiceE2eeEnvelopeInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const o = item as Record<string, unknown>;
    const recipientUserId =
      typeof o.recipientUserId === 'string' ? o.recipientUserId.trim() : '';
    const recipientDeviceId =
      typeof o.recipientDeviceId === 'string' ? o.recipientDeviceId.trim() : '';
    const ciphertext =
      typeof o.ciphertext === 'string' ? o.ciphertext.trim() : '';
    if (!recipientUserId || !recipientDeviceId || !ciphertext) return null;
    out.push({
      recipientUserId,
      recipientDeviceId,
      ciphertext,
      ...(o.envelope !== undefined ? { envelope: o.envelope } : {}),
    });
  }
  return out;
}

export default async function echoVoiceE2eeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/e2ee/envelopes',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const r = await listVoiceE2eeEnvelopesForUser(pool, {
        serverId: ECHO_DM_REALM_SERVER_ID,
        channelId,
        userId: req.authUser!.id,
      });
      if (!r.ok) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not a member of this thread.',
        );
      }
      return reply.code(200).send({
        epochId: r.epoch?.id ?? null,
        roomName: r.epoch?.roomName ?? null,
        createdByUserId: r.epoch?.createdByUserId ?? null,
        envelopes: r.envelopes,
      });
    },
  );

  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/e2ee/epoch',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: E2EE_EPOCH_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const body = req.body as Record<string, unknown> | undefined;
      const epochId =
        typeof body?.epochId === 'string' ? body.epochId.trim() : '';
      const envelopes = parseEnvelopeInputs(body?.envelopes);
      if (!epochId || envelopes === null) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'epochId and envelopes are required',
        );
      }
      const result = await createVoiceE2eeEpochWithEnvelopes(pool, {
        serverId: ECHO_DM_REALM_SERVER_ID,
        channelId,
        actorUserId: req.authUser!.id,
        epochId,
        envelopes,
      });
      const err = sendVoiceE2eeEpochCreateError(reply, result);
      if (err) return err;
      await publishVoiceE2eeEpochSupersededForVcPeers(
        fastify,
        pool,
        ECHO_DM_REALM_SERVER_ID,
        channelId,
        req.authUser!.id,
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/voice/e2ee/envelopes',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const r = await listVoiceE2eeEnvelopesForUser(pool, {
        serverId,
        channelId,
        userId: req.authUser!.id,
      });
      if (!r.ok) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot access this channel.',
        );
      }
      return reply.code(200).send({
        epochId: r.epoch?.id ?? null,
        roomName: r.epoch?.roomName ?? null,
        createdByUserId: r.epoch?.createdByUserId ?? null,
        envelopes: r.envelopes,
      });
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/voice/e2ee/epoch',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: E2EE_EPOCH_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const body = req.body as Record<string, unknown> | undefined;
      const epochId =
        typeof body?.epochId === 'string' ? body.epochId.trim() : '';
      const envelopes = parseEnvelopeInputs(body?.envelopes);
      if (!epochId || envelopes === null) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'epochId and envelopes are required',
        );
      }
      const result = await createVoiceE2eeEpochWithEnvelopes(pool, {
        serverId,
        channelId,
        actorUserId: req.authUser!.id,
        epochId,
        envelopes,
      });
      const err = sendVoiceE2eeEpochCreateError(reply, result);
      if (err) return err;
      await publishVoiceE2eeEpochSupersededForVcPeers(
        fastify,
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      return reply.code(204).send();
    },
  );
}
