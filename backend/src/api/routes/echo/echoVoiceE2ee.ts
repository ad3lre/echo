import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  createVoiceE2eeEpochWithEnvelopes,
  listVoiceE2eeEnvelopesForUser,
  type EchoVoiceE2eeEnvelopeInput,
} from '../../../domain/echoStore';
import { ECHO_DM_REALM_SERVER_ID } from '../../../domain/echoStore/dmThreads';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

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
    { preHandler: [requireAuth, requireEchoStore] },
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
      if (result === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot create voice E2EE epoch for this thread.',
        );
      }
      if (result === 'invalid_body') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid envelope payload.',
        );
      }
      if (result === 'bad_epoch_id') {
        return sendError(reply, 400, 'INVALID_BODY', 'epochId must be a UUID.');
      }
      if (result === 'too_many_envelopes') {
        return sendError(reply, 400, 'INVALID_BODY', 'Too many envelopes.');
      }
      if (result === 'device_invalid') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Unknown or revoked E2EE device for a recipient.',
        );
      }
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
    { preHandler: [requireAuth, requireEchoStore] },
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
      if (result === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot create voice E2EE epoch for this channel.',
        );
      }
      if (result === 'invalid_body') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid envelope payload.',
        );
      }
      if (result === 'bad_epoch_id') {
        return sendError(reply, 400, 'INVALID_BODY', 'epochId must be a UUID.');
      }
      if (result === 'too_many_envelopes') {
        return sendError(reply, 400, 'INVALID_BODY', 'Too many envelopes.');
      }
      if (result === 'device_invalid') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Unknown or revoked E2EE device for a recipient.',
        );
      }
      return reply.code(204).send();
    },
  );
}
