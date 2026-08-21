/**
 * Monthly image browse categories (Google Trends RSS → Serper image search queries).
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  getImageBrowseCategoriesForApi,
  refreshImageBrowseCategoriesIfStale,
} from '../../services/search/googleTrendsImageCategories';

export default async function imageBrowseCategoriesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (req) => `image-categories:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get('/image-browse-categories', async (request, reply) => {
      void refreshImageBrowseCategoriesIfStale(request.log).catch(() => {
        /* non-blocking warm */
      });
      const snapshot = getImageBrowseCategoriesForApi();
      return reply.send({
        monthKey: snapshot.monthKey,
        source: snapshot.source,
        categories: snapshot.categories,
      });
    });
  });
}
