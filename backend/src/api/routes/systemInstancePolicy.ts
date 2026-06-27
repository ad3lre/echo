import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { toInstancePolicyPublic } from '../../../../shared/instancePolicy';
import { getInstancePolicy } from '../../config/instancePolicy';

export default async function systemInstancePolicyRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    '/system/instance-policy',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const payload = toInstancePolicyPublic(getInstancePolicy());
      reply.header('Cache-Control', 'public, max-age=30');
      return reply.send(payload);
    },
  );
}
