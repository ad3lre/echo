import type { FastifyInstance } from 'fastify';
import { sendError } from '../../errors';
import { requireAuth } from '../../../auth/middleware';
import { getPgPool } from '../../../db/pg';
import { config } from '../../../config';
import {
  deleteEchoPlusInterest,
  getEchoPlusInterestForUser,
  listEchoPlusInterest,
  normalizeEchoPlusInterestBillingCycle,
  normalizeEchoPlusInterestTier,
  upsertEchoPlusInterest,
} from '../../../domain/echoPlusInterest';

function interestAdminAllowed(userId: string): boolean {
  const allow = config.echoPlusInterestAdminUserIds;
  return allow.length > 0 && allow.includes(userId);
}

export default async function echoPlusInterestRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.put<{
    Body: { tier?: string; billingCycle?: string };
  }>(
    '/echo-plus-interest',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tier: { type: 'string', enum: ['plus', 'black', 'any'] },
            billingCycle: { type: 'string', enum: ['monthly', 'yearly'] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Upgrade your account to register interest in Echo+.',
        );
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Subscription interest requires a database.',
        );
      }
      const tier = normalizeEchoPlusInterestTier(req.body?.tier) ?? 'any';
      const billingCycle =
        normalizeEchoPlusInterestBillingCycle(req.body?.billingCycle) ??
        'monthly';
      try {
        const interest = await upsertEchoPlusInterest(
          pool,
          req.authUser.id,
          tier,
          billingCycle,
        );
        return reply.code(200).send({ interest });
      } catch (err) {
        fastify.log.error(err, 'echo_plus_interest_upsert_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.delete(
    '/echo-plus-interest',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Subscription interest requires a database.',
        );
      }
      try {
        await deleteEchoPlusInterest(pool, req.authUser.id);
        return reply.code(204).send();
      } catch (err) {
        fastify.log.error(err, 'echo_plus_interest_delete_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.get(
    '/echo-plus-interest',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Subscription interest requires a database.',
        );
      }
      try {
        const interest = await getEchoPlusInterestForUser(
          pool,
          req.authUser.id,
        );
        return reply.code(200).send({ interest });
      } catch (err) {
        fastify.log.error(err, 'echo_plus_interest_get_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    '/echo-plus-interest/list',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }
      if (!interestAdminAllowed(req.authUser.id)) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not allowed');
      }
      const pool = getPgPool();
      if (!pool) {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'Subscription interest requires a database.',
        );
      }
      const limit = Number(req.query?.limit ?? 500);
      const offset = Number(req.query?.offset ?? 0);
      try {
        const { entries, total } = await listEchoPlusInterest(
          pool,
          Number.isFinite(limit) ? limit : 500,
          Number.isFinite(offset) ? offset : 0,
        );
        return reply.code(200).send({ interests: entries, total });
      } catch (err) {
        fastify.log.error(err, 'echo_plus_interest_list_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );
}
