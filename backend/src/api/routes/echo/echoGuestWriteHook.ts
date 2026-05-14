import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../../errors';
import { isGuestEchoMutationAllowed } from '../../../domain/echoGuestPolicy';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Call **after** all Echo route plugins register so this runs **after** route `preHandler`s (e.g. `requireAuth`).
 */
export function registerEchoGuestWriteGuard(fastify: FastifyInstance): void {
  fastify.addHook(
    'preHandler',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser?.isGuest) return;
      const method = req.method || 'GET';
      if (SAFE_METHODS.has(method)) return;
      const routeUrl = req.routeOptions?.url;
      if (isGuestEchoMutationAllowed(method, routeUrl)) return;
      return sendError(
        reply,
        403,
        'GUEST_FORBIDDEN',
        'Create an account to use this feature.',
      );
    },
  );
}
