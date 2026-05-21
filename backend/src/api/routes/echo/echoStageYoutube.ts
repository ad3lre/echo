import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { sendError, ECHO_MSG_NOT_SERVER_MEMBER } from '../../errors';
import { requireAuth } from '../../../auth/middleware';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import {
  getStageYoutubeStreamStatus,
  startStageYoutubeStream,
  stopStageYoutubeStream,
} from '../../../services/stage/stageYoutubeStream';
import type { YoutubeLivePrivacy } from '../../../services/integrations/youtubeApiClient';

type StartBody = {
  title?: string;
  description?: string;
  privacyStatus?: YoutubeLivePrivacy;
};

const STAGE_YOUTUBE_MUTATE_RATE = {
  max: 6,
  timeWindow: '1 minute' as const,
  keyGenerator: authUserOrIpRateLimitKey,
};

export default async function echoStageYoutubeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/stage/youtube',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: authUserOrIpRateLimitKey },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const stream = await getStageYoutubeStreamStatus(
        pool,
        serverId,
        channelId,
        req.authUser!.id,
      );
      return reply.code(200).send({ stream });
    },
  );

  fastify.post<{
    Params: { serverId: string; channelId: string };
    Body?: StartBody;
  }>(
    '/servers/:serverId/channels/:channelId/stage/youtube/start',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: STAGE_YOUTUBE_MUTATE_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const body = (req.body as StartBody | undefined) ?? {};
      const r = await startStageYoutubeStream(pool, {
        serverId,
        channelId,
        actorUserId: req.authUser!.id,
        title: body.title,
        description: body.description,
        privacyStatus: body.privacyStatus,
      });
      if (!r.ok) {
        const status =
          r.code === 'FORBIDDEN'
            ? 403
            : r.code === 'ALREADY_LIVE'
              ? 409
              : r.code === 'NOT_FOUND'
                ? 404
                : r.code === 'NOT_STAGE_CHANNEL'
                  ? 400
                  : 503;
        return sendError(reply, status, r.code, r.message);
      }
      return reply.code(200).send({ stream: r.stream });
    },
  );

  fastify.post<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/channels/:channelId/stage/youtube/stop',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: { rateLimit: STAGE_YOUTUBE_MUTATE_RATE },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const serverId = trimEchoPathParam(req.params.serverId);
      const channelId = trimEchoPathParam(req.params.channelId);
      const okMem = await isMemberOfServer(pool, serverId, req.authUser!.id);
      if (!okMem) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      }
      const r = await stopStageYoutubeStream(pool, {
        serverId,
        channelId,
        actorUserId: req.authUser!.id,
      });
      if (!r.ok) {
        const status =
          r.code === 'FORBIDDEN'
            ? 403
            : r.code === 'NOT_LIVE'
              ? 404
              : 400;
        return sendError(reply, status, r.code, r.message);
      }
      return reply.code(204).send();
    },
  );
}
