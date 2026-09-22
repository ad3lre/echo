import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import { canViewEchoPeerSocialGraph } from '../../../domain/echoStore';
import { listEchoMutualServers } from '../../../domain/echoStore/social/mutualServers';
import { echoPool, requireEchoStore } from './routeUtils';

function guestFriendsForbidden(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    403,
    'UPGRADE_REQUIRED',
    'Add an email and password to use Friends and social features.',
  );
}

/** Light mutual-server list for expanded profiles (Apple / thin clients). */
export default async function echoMutualServersRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Querystring: { peerId?: string } }>(
    '/friends/mutual-servers',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) return guestFriendsForbidden(reply);
      const pool = echoPool(req);
      const peerId =
        typeof req.query.peerId === 'string' ? req.query.peerId.trim() : '';
      if (!peerId) {
        return sendError(reply, 400, 'INVALID_QUERY', 'peerId required');
      }
      if (peerId === getAuthUser(req).id) {
        return reply.code(200).send({ servers: [] as const });
      }
      const canView = await canViewEchoPeerSocialGraph(
        pool,
        getAuthUser(req).id,
        peerId,
      );
      if (!canView) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You can only inspect mutual servers for yourself, accepted friends, or users who share a server with you',
        );
      }
      const servers = await listEchoMutualServers(
        pool,
        getAuthUser(req).id,
        peerId,
      );
      return reply.code(200).send({ servers });
    },
  );
}
