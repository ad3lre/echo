import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { config } from '../../../config';
import {
  incrementEchoVcActivityOpen,
  listEchoVcActivityPopularityOrdered,
} from '../../../domain/echoStore/voice/vcActivityPopularity';
import {
  readYoutubeWatchTogetherUsage,
  tryConsumeYoutubeWatchTogetherSeconds,
  youtubeWatchTogetherUtcDayKey,
} from '../../../services/watchTogether/youtubeWatchTogetherUsageBudget';
import { isEchoVcActivityKey } from '../../../../../activities/cores/vcActivityCatalog';
import { sendError } from '../../errors';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';

function youtubeWatchTogetherBudgetPayload() {
  return {
    userBudgetSec: config.youtubeWatchTogetherUserBudgetSec,
    globalBudgetSec: config.youtubeWatchTogetherGlobalBudgetSec,
    browseCostSec: config.youtubeWatchTogetherBrowseCostSec,
  };
}

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

  fastify.get(
    '/vc-activities/youtube/usage',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = req.authUser?.id;
      if (!userId) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const snap = await readYoutubeWatchTogetherUsage(userId);
      const utcDay = snap?.utcDay ?? youtubeWatchTogetherUtcDayKey();
      return reply.send({
        redisAvailable: snap != null,
        utcDay,
        userUsedSec: snap?.userUsedSec ?? 0,
        globalUsedSec: snap?.globalUsedSec ?? 0,
        ...youtubeWatchTogetherBudgetPayload(),
      });
    },
  );

  fastify.post<{ Body: { elapsedSec?: unknown } }>(
    '/vc-activities/youtube/usage',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const userId = req.authUser?.id;
      if (!userId) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required');
      }
      const raw = req.body?.elapsedSec;
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string'
            ? Number(raw)
            : NaN;
      const elapsed = Math.floor(Number.isFinite(n) ? n : 0);
      if (!Number.isFinite(elapsed) || elapsed < 1 || elapsed > 600) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'elapsedSec must be an integer from 1 to 600',
        );
      }
      const r = await tryConsumeYoutubeWatchTogetherSeconds(userId, elapsed);
      if (!r.ok) {
        const msg =
          r.reason === 'global'
            ? 'This Echo instance has reached its daily YouTube watch together budget. Try again tomorrow (UTC).'
            : 'You have reached your daily YouTube watch together budget. Try again tomorrow (UTC).';
        return sendError(
          reply,
          429,
          'YOUTUBE_WATCH_TOGETHER_QUOTA',
          msg,
          r.reason === 'global' ? 'GLOBAL_QUOTA' : 'USER_QUOTA',
        );
      }
      return reply.send({
        redisAvailable: !!config.redisUrl?.trim(),
        utcDay: youtubeWatchTogetherUtcDayKey(),
        userUsedSec: r.userUsedSec,
        globalUsedSec: r.globalUsedSec,
        ...youtubeWatchTogetherBudgetPayload(),
      });
    },
  );
}
