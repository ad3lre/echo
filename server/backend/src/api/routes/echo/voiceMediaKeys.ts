import type pg from 'pg';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  announceVoiceMediaKeys,
  listVoiceMediaKeyInbox,
  type AnnounceVoiceMediaKeyResult,
  type VoiceMediaKeyEnvelopeInput,
} from '../../../domain/echoStore';
import { ECHO_DM_REALM_SERVER_ID } from '../../../domain/echoStore/social/dmThreads';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

const MEDIA_KEY_RATE = {
  max: 60,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

function sendAnnounceError(
  reply: FastifyReply,
  result: AnnounceVoiceMediaKeyResult,
): ReturnType<typeof sendError> | null {
  switch (result) {
    case 'ok':
      return null;
    case 'forbidden':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Cannot announce voice media keys.',
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
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Invalid media-key payload.',
      );
    case 'too_many_envelopes':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Too many envelopes for one announcement.',
      );
    case 'device_invalid':
      return sendError(
        reply,
        400,
        'INVALID_BODY',
        'Unknown or revoked E2EE device.',
      );
    case 'infra_missing':
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage is not available on this server.',
      );
    default:
      return sendError(
        reply,
        500,
        'INTERNAL',
        'Voice media key announce failed.',
      );
  }
}

function parseEnvelopeInputs(
  raw: unknown,
): VoiceMediaKeyEnvelopeInput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: VoiceMediaKeyEnvelopeInput[] = [];
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

function publishMediaKeyNotify(
  fastify: FastifyInstance,
  serverId: string,
  channelId: string,
  senderUserId: string,
  keyIndex: number,
): void {
  publishEchoWorkspaceEvent(
    fastify,
    {
      kind: 'voice_media_key',
      version: nextEchoSnowflakeId(),
      serverId,
      voiceChannelId: channelId,
      voiceMediaKey: {
        serverId,
        channelId,
        senderUserId,
        keyIndex,
      },
    },
    { serverId },
  );
}

async function handleAnnounce(
  fastify: FastifyInstance,
  pool: pg.Pool,
  reply: FastifyReply,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    body: Record<string, unknown> | undefined;
  },
) {
  const senderDeviceId =
    typeof opts.body?.senderDeviceId === 'string'
      ? opts.body.senderDeviceId.trim()
      : '';
  const keyIndexRaw = opts.body?.keyIndex;
  const keyIndex =
    typeof keyIndexRaw === 'number'
      ? keyIndexRaw
      : typeof keyIndexRaw === 'string'
        ? Number(keyIndexRaw)
        : NaN;
  const envelopes = parseEnvelopeInputs(opts.body?.envelopes);
  if (!senderDeviceId || !Number.isFinite(keyIndex) || envelopes === null) {
    return sendError(
      reply,
      400,
      'INVALID_BODY',
      'senderDeviceId, keyIndex, and envelopes are required',
    );
  }
  const result = await announceVoiceMediaKeys(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    actorUserId: opts.actorUserId,
    senderDeviceId,
    keyIndex,
    envelopes,
  });
  const err = sendAnnounceError(reply, result);
  if (err) return err;
  publishMediaKeyNotify(
    fastify,
    opts.serverId,
    opts.channelId,
    opts.actorUserId,
    keyIndex,
  );
  return reply.code(204).send();
}

async function handleInbox(
  pool: pg.Pool,
  reply: FastifyReply,
  opts: {
    serverId: string;
    channelId: string;
    userId: string;
    senderUserId?: string;
  },
) {
  const r = await listVoiceMediaKeyInbox(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    userId: opts.userId,
    senderUserId: opts.senderUserId,
  });
  if (!r.ok) {
    if (r.reason === 'e2ee_disabled') {
      return sendError(
        reply,
        403,
        'VOICE_E2EE_DISABLED',
        'Voice E2EE is not enabled for this context.',
      );
    }
    if (r.reason === 'infra_missing') {
      return sendError(
        reply,
        503,
        'E2EE_STORAGE_UNAVAILABLE',
        'Encrypted voice storage is not available on this server.',
      );
    }
    return sendError(reply, 403, 'FORBIDDEN', 'Cannot access media keys.');
  }
  return reply.code(200).send({ envelopes: r.envelopes });
}

export default async function echoVoiceMediaKeyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Params: { channelId: string };
    Querystring: { senderUserId?: string };
  }>(
    '/dm/channels/:channelId/voice/e2ee/media-keys',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const senderUserId =
        typeof req.query?.senderUserId === 'string'
          ? req.query.senderUserId.trim()
          : undefined;
      return handleInbox(pool, reply, {
        serverId: ECHO_DM_REALM_SERVER_ID,
        channelId,
        userId: getAuthUser(req).id,
        senderUserId,
      });
    },
  );

  fastify.post<{ Params: { channelId: string } }>(
    '/dm/channels/:channelId/voice/e2ee/media-keys',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MEDIA_KEY_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      return handleAnnounce(fastify, pool, reply, {
        serverId: ECHO_DM_REALM_SERVER_ID,
        channelId,
        actorUserId: getAuthUser(req).id,
        body: req.body as Record<string, unknown> | undefined,
      });
    },
  );

  fastify.get<{
    Params: { serverId: string; channelId: string };
    Querystring: { senderUserId?: string };
  }>(
    '/servers/:serverId/channels/:channelId/voice/e2ee/media-keys',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const senderUserId =
        typeof req.query?.senderUserId === 'string'
          ? req.query.senderUserId.trim()
          : undefined;
      return handleInbox(pool, reply, {
        serverId,
        channelId,
        userId: getAuthUser(req).id,
        senderUserId,
      });
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
  }>(
    '/servers/:serverId/channels/:channelId/voice/e2ee/media-keys',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: MEDIA_KEY_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      return handleAnnounce(fastify, pool, reply, {
        serverId,
        channelId,
        actorUserId: getAuthUser(req).id,
        body: req.body as Record<string, unknown> | undefined,
      });
    },
  );
}
