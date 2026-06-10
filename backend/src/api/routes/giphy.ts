/**
 * GIF API proxy (Giphy primary, Klipy fallback). Keeps API keys server-side.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  fetchTrendingGifs,
  GifProvidersUnavailableError,
  searchGifs,
} from '../../services/gifProviders';
import { sendError } from '../errors';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 30;

function parseLimit(raw: unknown): number {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

export default async function giphyRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: (req) => `giphy:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Querystring: { limit?: string } }>(
      '/giphy/trending',
      async (request, reply) => {
        const limit = parseLimit(request.query.limit);
        try {
          return reply.send(await fetchTrendingGifs(request.log, limit));
        } catch (e) {
          if (e instanceof GifProvidersUnavailableError) {
            return sendError(
              reply,
              503,
              'SERVICE_UNAVAILABLE',
              'GIF provider not configured (set GIPHY_API_KEY and/or KLIPY_API_KEY)',
            );
          }
          request.log.warn({ err: e }, 'GIF trending failed');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'GIF provider error');
        }
      },
    );

    scope.get<{ Querystring: { q?: string; limit?: string } }>(
      '/giphy/search',
      async (request, reply) => {
        const q = request.query.q?.trim() ?? '';
        const limit = parseLimit(request.query.limit);
        try {
          return reply.send(await searchGifs(request.log, q, limit));
        } catch (e) {
          if (e instanceof GifProvidersUnavailableError) {
            return sendError(
              reply,
              503,
              'SERVICE_UNAVAILABLE',
              'GIF provider not configured (set GIPHY_API_KEY and/or KLIPY_API_KEY)',
            );
          }
          request.log.warn({ err: e, q }, 'GIF search failed');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'GIF provider error');
        }
      },
    );
  });
}
