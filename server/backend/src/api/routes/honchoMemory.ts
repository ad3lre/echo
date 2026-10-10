/**
 * Honcho conversational memory API — server-side proxy for future Echo AI features.
 * Disabled unless HONCHO_ENABLED=true and HONCHO_API_KEY is configured.
 *
 * @see https://honcho.dev/docs/v3/documentation/introduction/overview
 */

import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { requireAuth } from '../../auth/middleware';
import { config } from '../../config';
import {
  isHonchoActive,
  isHonchoConfigured,
} from '../../services/honcho/client';
import {
  honchoEnsureSession,
  honchoQueryPeer,
  honchoRecordMessage,
  echoHonchoSessionId,
} from '../../services/honcho/memory';
import { sendError } from '../errors';

async function requireHonchoActive(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isHonchoActive()) return;
  honchoUnavailable(reply);
}

function honchoUnavailable(reply: Parameters<typeof sendError>[0]) {
  if (!isHonchoConfigured()) {
    return sendError(
      reply,
      503,
      'SERVICE_UNAVAILABLE',
      'HONCHO_API_KEY is not configured',
    );
  }
  return sendError(
    reply,
    503,
    'SERVICE_UNAVAILABLE',
    'Honcho memory is disabled (set HONCHO_ENABLED=true to enable)',
  );
}

export default async function honchoMemoryRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: config.honchoRateLimitPerMinute,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        const uid = req.authUser?.id;
        return uid ? `honcho:uid:${uid}` : `honcho:ip:${req.ip}`;
      },
      addHeaders: { 'retry-after': true },
    });

    scope.get('/honcho/status', async (_request, reply) => {
      return reply.send({
        enabled: config.honchoEnabled,
        configured: isHonchoConfigured(),
        active: isHonchoActive(),
        workspaceId: config.honchoWorkspaceId,
      });
    });

    scope.post<{ Body: { sessionId?: string } }>(
      '/honcho/sessions',
      { preHandler: [requireHonchoActive, requireAuth] },
      async (request, reply) => {
        const sessionId = request.body?.sessionId?.trim();
        if (!sessionId) {
          return sendError(reply, 400, 'INVALID_BODY', 'sessionId is required');
        }
        const userId = request.authUser!.id;
        try {
          const result = await honchoEnsureSession(
            echoHonchoSessionId(userId, sessionId),
            { [userId]: {} },
          );
          return reply.send(result);
        } catch (err) {
          fastify.log.warn({ err }, 'Honcho ensure session failed');
          return sendError(
            reply,
            502,
            'UPSTREAM_ERROR',
            'Honcho session request failed',
          );
        }
      },
    );

    scope.post<{
      Params: { sessionId: string };
      Body: { content?: string; metadata?: Record<string, unknown> };
    }>(
      '/honcho/sessions/:sessionId/messages',
      { preHandler: [requireHonchoActive, requireAuth] },
      async (request, reply) => {
        const sessionId = request.params.sessionId?.trim();
        const content = request.body?.content?.trim() ?? '';
        if (!sessionId) {
          return sendError(reply, 400, 'INVALID_BODY', 'sessionId is required');
        }
        if (!content) {
          return sendError(reply, 400, 'INVALID_BODY', 'content is required');
        }
        const userId = request.authUser!.id;
        try {
          const result = await honchoRecordMessage({
            sessionId: echoHonchoSessionId(userId, sessionId),
            peerId: userId,
            content,
            metadata: {
              ...(request.body?.metadata ?? {}),
              echoUserId: userId,
            },
          });
          return reply.send(result);
        } catch (err) {
          fastify.log.warn(
            { err, sessionId, userId },
            'Honcho record message failed',
          );
          return sendError(
            reply,
            502,
            'UPSTREAM_ERROR',
            'Honcho message request failed',
          );
        }
      },
    );

    scope.post<{
      Body: {
        query?: string;
        sessionId?: string;
        targetPeerId?: string;
        reasoningLevel?: string;
      };
    }>(
      '/honcho/me/chat',
      { preHandler: [requireHonchoActive, requireAuth] },
      async (request, reply) => {
        const query = request.body?.query?.trim() ?? '';
        if (!query) {
          return sendError(reply, 400, 'INVALID_BODY', 'query is required');
        }
        const userId = request.authUser!.id;
        const rawSessionId = request.body?.sessionId?.trim();
        const requestedTargetPeerId = request.body?.targetPeerId?.trim();
        if (requestedTargetPeerId && requestedTargetPeerId !== userId) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Honcho peer queries are limited to the authenticated user',
          );
        }
        try {
          const result = await honchoQueryPeer({
            peerId: userId,
            query,
            sessionId: rawSessionId
              ? echoHonchoSessionId(userId, rawSessionId)
              : undefined,
            targetPeerId: userId,
            reasoningLevel: request.body?.reasoningLevel?.trim() || undefined,
          });
          return reply.send(result);
        } catch (err) {
          fastify.log.warn({ err, userId }, 'Honcho peer chat failed');
          return sendError(
            reply,
            502,
            'UPSTREAM_ERROR',
            'Honcho chat request failed',
          );
        }
      },
    );
  });
}
