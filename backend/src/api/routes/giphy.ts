/**
 * Giphy API proxy. Keeps API key server-side.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../../config';
import { GIPHY_FETCH_MS } from '../../constants/outboundHttp';
import { sendError } from '../errors';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const LIMIT = 24;
const RATING = 'g';

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

    scope.get<{ Querystring: { q?: string } }>(
      '/giphy/trending',
      async (_request, reply) => {
        if (!config.giphyApiKey) {
          return sendError(
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'GIPHY_API_KEY not configured',
          );
        }
        const url = `${GIPHY_BASE}/trending?api_key=${config.giphyApiKey}&limit=${LIMIT}&rating=${RATING}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(GIPHY_FETCH_MS),
        });
        if (!res.ok) {
          fastify.log.warn({ status: res.status }, 'Giphy trending failed');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'Giphy API error');
        }
        let json: { data?: unknown[] };
        try {
          json = (await res.json()) as { data?: unknown[] };
        } catch (err) {
          fastify.log.warn({ err }, 'Giphy trending: malformed JSON');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'Giphy API error');
        }
        return reply.send(json.data ?? []);
      },
    );

    scope.get<{ Querystring: { q?: string } }>(
      '/giphy/search',
      async (request, reply) => {
        if (!config.giphyApiKey) {
          return sendError(
            reply,
            503,
            'SERVICE_UNAVAILABLE',
            'GIPHY_API_KEY not configured',
          );
        }
        const q = request.query.q?.trim() ?? '';
        const url = `${GIPHY_BASE}/search?api_key=${config.giphyApiKey}&q=${encodeURIComponent(q)}&limit=${LIMIT}&rating=${RATING}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(GIPHY_FETCH_MS),
        });
        if (!res.ok) {
          fastify.log.warn({ status: res.status, q }, 'Giphy search failed');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'Giphy API error');
        }
        let json: { data?: unknown[] };
        try {
          json = (await res.json()) as { data?: unknown[] };
        } catch (err) {
          fastify.log.warn({ err, q }, 'Giphy search: malformed JSON');
          return sendError(reply, 502, 'UPSTREAM_ERROR', 'Giphy API error');
        }
        return reply.send(json.data ?? []);
      },
    );
  });
}
