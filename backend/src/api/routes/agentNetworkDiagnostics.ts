import crypto from 'crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { config } from '../../config';
import { sendError } from '../errors';
import { getRecentNetworkDiagnostics } from '../../observability/networkDiagnostics';

function bearerMatchesConfiguredToken(
  authorizationHeader: string | string[] | undefined,
  expectedToken: string,
): boolean {
  const raw = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  const h = typeof raw === 'string' ? raw.trim() : '';
  const prefix = 'Bearer ';
  if (!h.toLowerCase().startsWith(prefix.toLowerCase())) return false;
  const presented = h.slice(prefix.length).trim();
  if (!presented) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expectedToken);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

const agentNetworkDiagnosticsRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => `agent-net-diag:${req.ip}`,
    addHeaders: { 'retry-after': true },
  });

  fastify.get(
    '/network-diagnostics',
    async (
      req: FastifyRequest<{
        Querystring: { traceId?: string; limit?: string };
      }>,
      reply,
    ) => {
      if (!config.echoAgentNetworkDiagnosticsEnabled) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not found');
      }
      const token = config.echoAgentNetworkDiagnosticsToken?.trim() ?? '';
      if (
        !token ||
        !bearerMatchesConfiguredToken(req.headers.authorization, token)
      ) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }

      const limit = parseLimit(req.query?.limit);
      return reply.send({
        generatedAt: new Date().toISOString(),
        traceId:
          typeof req.query?.traceId === 'string'
            ? req.query.traceId.trim() || null
            : null,
        entries: getRecentNetworkDiagnostics({
          traceId:
            typeof req.query?.traceId === 'string'
              ? req.query.traceId
              : undefined,
          limit,
        }),
      });
    },
  );
};

export default agentNetworkDiagnosticsRoutes;
