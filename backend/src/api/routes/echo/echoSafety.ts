import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  blockEchoUser,
  insertEchoUserReport,
  listEchoBlockedUserIds,
  unblockEchoUser,
} from '../../../domain/echoStore';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoSafetyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/blocks',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const blockedUserIds = await listEchoBlockedUserIds(
        pool,
        req.authUser!.id,
      );
      return reply.code(200).send({ blockedUserIds });
    },
  );

  fastify.post<{ Body: { targetUserId?: string } }>(
    '/blocks',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target =
        typeof req.body?.targetUserId === 'string'
          ? req.body.targetUserId.trim()
          : '';
      if (!target)
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      if (target === req.authUser!.id)
        return sendError(reply, 400, 'INVALID_BODY', 'Cannot block yourself');
      const br = await blockEchoUser(pool, req.authUser!.id, target);
      if (br === 'user_not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      if (br === 'already_blocked')
        return reply.code(200).send({ alreadyBlocked: true });
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { targetUserId: string } }>(
    '/blocks/:targetUserId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target = trimEchoPathParam(req.params.targetUserId);
      if (!target)
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      if (target === req.authUser!.id)
        return sendError(reply, 400, 'INVALID_BODY', 'Cannot unblock yourself');
      const ub = await unblockEchoUser(pool, req.authUser!.id, target);
      if (ub === 'target_not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      if (ub === 'not_blocked')
        return sendError(
          reply,
          404,
          'NOT_BLOCKED',
          'You are not blocking that user',
        );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Body: { targetUserId?: string; reason?: string } }>(
    '/reports/user',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const target =
        typeof req.body?.targetUserId === 'string'
          ? req.body.targetUserId.trim()
          : '';
      if (!target)
        return sendError(reply, 400, 'INVALID_BODY', 'targetUserId required');
      if (target === req.authUser!.id)
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid target');
      const reason =
        typeof req.body?.reason === 'string' ? req.body.reason : '';
      const peer = await pool.query(`SELECT 1 FROM auth_users WHERE id = $1`, [
        target,
      ]);
      if (peer.rows.length === 0)
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      await insertEchoUserReport(pool, req.authUser!.id, target, reason);
      return reply.code(204).send();
    },
  );
}
