import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireInstanceOperator } from '../../../auth/middleware';
import {
  listInstanceBans,
  revokeInstanceBan,
  setUserInstanceOperator,
} from '../../../domain/echoStore/instanceBans';
import { sendError } from '../../errors';
import { ECHO_ADMIN_MUTATION_RATE_LIMIT } from './echoMutationRateLimits';
import {
  deleteInstanceOperatorHandler,
  postInstanceBanHandler,
} from './echoInstanceBanHandlers';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoInstanceBansRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.addHook('preHandler', requireInstanceOperator);

  fastify.get<{
    Querystring: {
      limit?: string;
      cursor?: string;
      userId?: string;
      ip?: string;
      hwidHash?: string;
    };
  }>('/bans', { preHandler: [requireEchoStore] }, async (req, reply) => {
    const pool = echoPool(req);
    const limitRaw = req.query?.limit
      ? Number.parseInt(req.query.limit, 10)
      : 50;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    const { bans, nextCursor } = await listInstanceBans(pool, {
      limit,
      cursor: req.query?.cursor?.trim() || null,
      userId: req.query?.userId?.trim() || null,
      ip: req.query?.ip?.trim() || null,
      hwidHash: req.query?.hwidHash?.trim() || null,
    });
    return reply.code(200).send({ bans, nextCursor });
  });

  await fastify.register(async (mutations) => {
    await mutations.register(rateLimit, {
      ...ECHO_ADMIN_MUTATION_RATE_LIMIT,
    });

    mutations.post<{
      Body: {
        reason?: string;
        userId?: string;
        ip?: string;
        hwidHash?: string;
        expiresAtMinutes?: number;
        isAllowlisted?: boolean;
        includeLastSeenIp?: boolean;
        includeKnownHwid?: boolean;
      };
    }>('/bans', { preHandler: [requireEchoStore] }, async (req, reply) =>
      postInstanceBanHandler(fastify, echoPool(req), req, reply),
    );

    mutations.delete<{ Params: { banId: string } }>(
      '/bans/:banId',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const banId = trimEchoPathParam(req.params.banId);
        if (!banId) {
          return sendError(reply, 400, 'INVALID_BODY', 'banId required');
        }
        const revoked = await revokeInstanceBan(
          pool,
          banId,
          getAuthUser(req).id,
        );
        if (!revoked) {
          return sendError(reply, 404, 'NOT_FOUND', 'Ban not found');
        }
        return reply.code(200).send({ ban: revoked });
      },
    );

    mutations.post<{ Params: { userId: string } }>(
      '/operators/:userId',
      { preHandler: [requireEchoStore] },
      async (req, reply) => {
        const pool = echoPool(req);
        const userId = trimEchoPathParam(req.params.userId);
        if (!userId) {
          return sendError(reply, 400, 'INVALID_BODY', 'userId required');
        }
        const ok = await setUserInstanceOperator(
          pool,
          userId,
          true,
          getAuthUser(req).id,
        );
        if (!ok) {
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        return reply.code(204).send();
      },
    );

    mutations.delete<{ Params: { userId: string } }>(
      '/operators/:userId',
      { preHandler: [requireEchoStore] },
      async (req, reply) =>
        deleteInstanceOperatorHandler(echoPool(req), req, reply),
    );
  });
}
