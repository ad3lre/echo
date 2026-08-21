import rateLimit from '@fastify/rate-limit';
import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import {
  ECHO_E2EE_DEVICE_MUTATION_RATE,
  e2eePairingRateLimitKey,
} from '../../sharedMutationRateLimits';
import { isPostgresUndefinedRelationError } from '../../../db/pgErrors';
import { sendError } from '../../errors';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';
import {
  diagnoseEchoChannelAccess,
  createEchoE2eePairingSession,
  assertEchoE2eePeerBundleFetchQuota,
  echoUsersMayFetchE2eeDeviceBundle,
  getEchoE2eePairingStateForUser,
  getEchoE2eeThreadState,
  listEchoE2eeDevicesForUser,
  listEchoE2eePeerDeviceBundles,
  normalizeEchoE2eeDeviceUpsertInput,
  refreshEchoE2eeOneTimePrekeys,
  respondEchoE2eePairing,
  revokeEchoE2eeDevice,
  upsertEchoE2eeDevice,
} from '../../../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import { echoE2eePairingTotal } from '../../../observability/echoMetrics';

function replyE2eeInfraMissing(reply: FastifyReply): unknown {
  return sendError(
    reply,
    503,
    'E2EE_UNAVAILABLE',
    'End-to-end encryption is not available on this server (E2EE database tables are missing).',
  );
}

export default async function echoE2eeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post(
    '/e2ee/devices/register',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: ECHO_E2EE_DEVICE_MUTATION_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const parsed = normalizeEchoE2eeDeviceUpsertInput(req.body);
      if (!parsed.ok) {
        return sendError(reply, 400, 'INVALID_BODY', parsed.error);
      }
      try {
        await upsertEchoE2eeDevice(pool, getAuthUser(req).id, parsed.value);
      } catch (e) {
        if (isPostgresUndefinedRelationError(e))
          return replyE2eeInfraMissing(reply);
        throw e;
      }
      // Notify all sessions for this user to refresh device list / state.
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: nextEchoSnowflakeId(),
          userId: getAuthUser(req).id,
        },
        { userId: getAuthUser(req).id },
      );
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/e2ee/devices',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const devices = await listEchoE2eeDevicesForUser(
        pool,
        getAuthUser(req).id,
      );
      return reply.code(200).send({ devices });
    },
  );

  fastify.post<{ Params: { deviceId: string } }>(
    '/e2ee/devices/:deviceId/revoke',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: ECHO_E2EE_DEVICE_MUTATION_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const deviceId = trimEchoPathParam(req.params.deviceId);
      if (!deviceId) {
        return sendError(reply, 400, 'INVALID_BODY', 'deviceId required');
      }
      let out: Awaited<ReturnType<typeof revokeEchoE2eeDevice>>;
      try {
        out = await revokeEchoE2eeDevice(pool, getAuthUser(req).id, deviceId);
      } catch (e) {
        if (isPostgresUndefinedRelationError(e))
          return replyE2eeInfraMissing(reply);
        throw e;
      }
      if (out === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Device not found');
      }
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'workspace_invalidated',
          version: nextEchoSnowflakeId(),
          userId: getAuthUser(req).id,
        },
        { userId: getAuthUser(req).id },
      );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { deviceId?: string; oneTimePrekeys?: unknown } }>(
    '/e2ee/prekeys/refresh',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: ECHO_E2EE_DEVICE_MUTATION_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const deviceId =
        typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
      if (!deviceId) {
        return sendError(reply, 400, 'INVALID_BODY', 'deviceId required');
      }
      let r: Awaited<ReturnType<typeof refreshEchoE2eeOneTimePrekeys>>;
      try {
        r = await refreshEchoE2eeOneTimePrekeys(
          pool,
          getAuthUser(req).id,
          deviceId,
          req.body?.oneTimePrekeys,
        );
      } catch (e) {
        if (isPostgresUndefinedRelationError(e))
          return replyE2eeInfraMissing(reply);
        throw e;
      }
      if (r === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Device not found');
      }
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/e2ee/thread/:channelId/state',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      if (!channelId) {
        return sendError(reply, 400, 'INVALID_BODY', 'channelId required');
      }
      const access = await diagnoseEchoChannelAccess(
        pool,
        getAuthUser(req).id,
        channelId,
      );
      if (!access.ok) {
        return sendError(
          reply,
          access.code === 'CHANNEL_NOT_FOUND' ? 404 : 403,
          access.code === 'CHANNEL_NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN',
          access.message,
        );
      }
      const state = await getEchoE2eeThreadState(pool, channelId);
      return reply.code(200).send(state);
    },
  );

  // Chat text E2EE was removed; voice uses LiveKit + device bundles instead.
  fastify.post<{ Params: { channelId: string } }>(
    '/dm/:channelId/e2ee/enable',
    { preHandler: [requireAuth, requireEchoStore] },
    async (_req, reply) => {
      return sendError(
        reply,
        410,
        'E2EE_CHAT_REMOVED',
        'Encrypted chat messages are no longer supported. Voice channels and calls use end-to-end encryption by default.',
      );
    },
  );

  fastify.get<{ Params: { targetUserId: string } }>(
    '/e2ee/peer/:targetUserId/device-bundle',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target = trimEchoPathParam(req.params.targetUserId);
      if (!target) {
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      }
      const me = getAuthUser(req).id;
      if (target === me) {
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId invalid');
      }
      const may = await echoUsersMayFetchE2eeDeviceBundle(pool, me, target);
      if (!may) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You can only fetch device bundles for users you have a DM, group chat, or active voice session with.',
        );
      }
      const quota = await assertEchoE2eePeerBundleFetchQuota(pool, me, target);
      if (quota === 'rate_limited') {
        return sendError(
          reply,
          429,
          'RATE_LIMITED',
          'Too many device bundle requests for this user. Try again later.',
        );
      }
      let bundles: Awaited<ReturnType<typeof listEchoE2eePeerDeviceBundles>>;
      try {
        bundles = await listEchoE2eePeerDeviceBundles(pool, target);
      } catch (e) {
        if (isPostgresUndefinedRelationError(e))
          return replyE2eeInfraMissing(reply);
        throw e;
      }
      if (!bundles.length) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Peer has no active E2EE device bundle',
        );
      }
      const bundle = bundles[0] ?? null;
      return reply.code(200).send({ bundle, bundles });
    },
  );

  await fastify.register(async (pairingScope) => {
    await pairingScope.register(rateLimit, {
      max: 30,
      timeWindow: '1 hour',
      keyGenerator: e2eePairingRateLimitKey,
      addHeaders: { 'retry-after': true },
    });

    pairingScope.post(
      '/e2ee/pairing/start',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          echoE2eePairingTotal.labels('start_forbidden_guest').inc();
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Sign in with a full account to use device pairing.',
          );
        }
        const pool = echoPool(req);
        const pairingId = nextEchoSnowflakeId();
        try {
          await createEchoE2eePairingSession(
            pool,
            getAuthUser(req).id,
            pairingId,
          );
        } catch (e) {
          if (isPostgresUndefinedRelationError(e)) {
            echoE2eePairingTotal.labels('start_infra_missing').inc();
            return replyE2eeInfraMissing(reply);
          }
          throw e;
        }
        echoE2eePairingTotal.labels('start_created').inc();
        return reply.code(201).send({ pairingId });
      },
    );

    pairingScope.get<{ Params: { pairingId: string } }>(
      '/e2ee/pairing/:pairingId',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const pairingId = trimEchoPathParam(req.params.pairingId);
        if (!pairingId) {
          echoE2eePairingTotal.labels('get_bad_pairing_id').inc();
          return sendError(reply, 400, 'INVALID_BODY', 'pairingId required');
        }
        let st: Awaited<ReturnType<typeof getEchoE2eePairingStateForUser>>;
        try {
          st = await getEchoE2eePairingStateForUser(
            pool,
            getAuthUser(req).id,
            pairingId,
          );
        } catch (e) {
          if (isPostgresUndefinedRelationError(e)) {
            echoE2eePairingTotal.labels('get_infra_missing').inc();
            return replyE2eeInfraMissing(reply);
          }
          throw e;
        }
        if (st.status === 'not_found') {
          echoE2eePairingTotal.labels('get_not_found').inc();
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Pairing session not found',
          );
        }
        if (st.status === 'expired') {
          echoE2eePairingTotal.labels('get_expired').inc();
          return sendError(reply, 410, 'EXPIRED', 'Pairing session expired');
        }
        if (st.status === 'ready') {
          echoE2eePairingTotal.labels('get_ready').inc();
          return reply.code(200).send({
            status: st.status,
            ciphertext: st.ciphertext,
          });
        }
        echoE2eePairingTotal.labels('get_pending').inc();
        return reply.code(200).send({ status: st.status });
      },
    );

    pairingScope.post<{
      Params: { pairingId: string };
      Body: { ciphertext?: string };
    }>(
      '/e2ee/pairing/:pairingId/respond',
      { preHandler: [requireAuth, requireEchoStore] },
      async (req, reply) => {
        if (req.authUser?.isGuest) {
          echoE2eePairingTotal.labels('respond_forbidden_guest').inc();
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Sign in with a full account to use device pairing.',
          );
        }
        const pool = echoPool(req);
        const pairingId = trimEchoPathParam(req.params.pairingId);
        const ciphertext =
          typeof req.body?.ciphertext === 'string' ? req.body.ciphertext : '';
        if (!pairingId) {
          echoE2eePairingTotal.labels('respond_bad_pairing_id').inc();
          return sendError(reply, 400, 'INVALID_BODY', 'pairingId required');
        }
        let out: Awaited<ReturnType<typeof respondEchoE2eePairing>>;
        try {
          out = await respondEchoE2eePairing(
            pool,
            getAuthUser(req).id,
            pairingId,
            ciphertext,
          );
        } catch (e) {
          if (isPostgresUndefinedRelationError(e)) {
            echoE2eePairingTotal.labels('respond_infra_missing').inc();
            return replyE2eeInfraMissing(reply);
          }
          throw e;
        }
        if (out === 'bad_body') {
          echoE2eePairingTotal.labels('respond_bad_body').inc();
          return sendError(reply, 400, 'INVALID_BODY', 'ciphertext required');
        }
        if (out === 'not_found') {
          echoE2eePairingTotal.labels('respond_not_found').inc();
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Pairing session not found or not pending',
          );
        }
        if (out === 'expired') {
          echoE2eePairingTotal.labels('respond_expired').inc();
          return sendError(reply, 410, 'EXPIRED', 'Pairing session expired');
        }
        echoE2eePairingTotal.labels('respond_ok').inc();
        return reply.code(204).send();
      },
    );
  });
}
