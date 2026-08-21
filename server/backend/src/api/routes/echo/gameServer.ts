import type { FastifyInstance } from 'fastify';
import { config } from '../../../config';
import { signGameToken } from '../../../auth/gameToken';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import { joinEchoVoiceChannel } from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/permissions/echoPermissions';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  isEchoVcActivityKey,
  type EchoVcActivityKey,
} from '../../../../../activities/cores/vcActivityCatalog';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

export type EchoGameTokenResponse = {
  url: string;
  token: string;
  roomId: string;
  gameKey: string;
};

function parseGameKeyBody(raw: unknown): EchoVcActivityKey | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = (raw as { gameKey?: unknown }).gameKey;
  return typeof key === 'string' && isEchoVcActivityKey(key) ? key : null;
}

/**
 * Mint short-lived game-server join tokens once the user is authenticated and
 * authorized for the voice channel. Mirrors the LiveKit session route shape.
 */
export default async function echoGameServerRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body: { gameKey?: string };
  }>(
    '/servers/:serverId/channels/:channelId/voice/game-token',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      if (!config.gameServerEnabled) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Game server is not configured',
        );
      }
      const gameKey = parseGameKeyBody(req.body);
      if (!gameKey) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'gameKey must be a valid VC activity key',
        );
      }
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const user = getAuthUser(req);
      const okMem = await isMemberOfServer(pool, serverId, user.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const join = await joinEchoVoiceChannel(
        pool,
        serverId,
        channelId,
        user.id,
        {
          membershipAlreadyVerified: true,
        },
      );
      if (!join.ok) {
        if (join.reason === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
        }
        if (join.reason === 'full') {
          return sendError(reply, 403, 'FORBIDDEN', 'Voice channel is full');
        }
        return sendError(reply, 403, 'FORBIDDEN', 'Cannot access this channel');
      }
      const token = signGameToken({
        sub: user.id,
        username: user.username,
        roomId: channelId,
        gameKey,
      });
      const body: EchoGameTokenResponse = {
        url: config.gameServerPublicUrl,
        token,
        roomId: channelId,
        gameKey,
      };
      return reply.send(body);
    },
  );
}
