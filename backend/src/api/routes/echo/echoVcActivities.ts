import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import {
  incrementEchoVcActivityOpen,
  listEchoVcActivityPopularityOrdered,
} from '../../../domain/echoStore/vcActivityPopularity';
import { isEchoVcActivityKey } from '../../../../../shared/vcActivityCatalog';
import { sendError } from '../../errors';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoVcActivitiesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/vc-activities/popularity',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const items = await listEchoVcActivityPopularityOrdered(pool);
      return reply.send({ items });
    },
  );

  fastify.post<{ Params: { activityKey: string } }>(
    '/vc-activities/:activityKey/open',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const raw = trimEchoPathParam(req.params.activityKey);
      if (!isEchoVcActivityKey(raw)) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Unknown activity key',
          'UNKNOWN_VC_ACTIVITY',
        );
      }
      const pool = echoPool(req);
      await incrementEchoVcActivityOpen(pool, raw);
      return reply.code(204).send();
    },
  );
}
