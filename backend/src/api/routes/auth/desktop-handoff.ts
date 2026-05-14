import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
import { loginAuditDigests } from '../../../auth/loginAudit';
import { getPgPool } from '../../../db/pg';
import { consumeDesktopOauthHandoff } from '../../../domain/desktopOAuthHandoffRepo';
import { isValidDesktopOauthHandoffNonce } from '../../../domain/desktopOAuthHandoffNonce';

export default async function desktopHandoffRoutes(fastify: FastifyInstance) {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 40,
      timeWindow: '15 minutes',
      keyGenerator: (req) => `auth_desktop_handoff:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });
    scope.post<{
      Body: { code?: string; nonce?: string; diagTraceId?: string };
    }>(
      '/desktop/redeem-handoff',
      {
        schema: {
          body: {
            type: 'object',
            required: ['code', 'nonce'],
            properties: {
              code: { type: 'string', minLength: 1 },
              nonce: { type: 'string', minLength: 1 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const code =
          typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        const nonce =
          typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '';
        fastify.log.info(
          {
            hasCode: Boolean(code),
            hasNonce: Boolean(nonce),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          },
          'desktop_handoff_redeem_attempt',
        );
        if (!code) {
          return sendError(reply, 400, 'BAD_REQUEST', 'Missing code');
        }
        if (!nonce || !isValidDesktopOauthHandoffNonce(nonce)) {
          return sendError(reply, 400, 'BAD_REQUEST', 'Missing handoff nonce');
        }
        const { mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Desktop handoff requires a database.',
          );
        }
        const pool = getPgPool();
        if (!pool) {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Database unavailable.',
          );
        }
        const consumed = await consumeDesktopOauthHandoff(pool, code, nonce);
        if (!consumed) {
          fastify.log.warn(
            {
              hasCode: true,
              ip: req.ip,
            },
            'desktop_handoff_redeem_invalid_or_expired',
          );
          return sendError(
            reply,
            401,
            'INVALID_HANDOFF',
            'Invalid or expired handoff code',
          );
        }
        try {
          const { store } = await getAuthStore();
          const user = await store.getUserById(consumed.userId);
          if (!user) {
            fastify.log.warn(
              {
                hasCode: true,
                userId: consumed.userId,
              },
              'desktop_handoff_redeem_user_missing',
            );
            return sendError(reply, 401, 'INVALID_HANDOFF', 'User not found');
          }
          const audit = loginAuditDigests(req);
          void store.recordLoginEvent({
            userId: user.id,
            eventType: 'login_success',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          const { user: logged, csrfToken } = await issueEchoBrowserSession(
            store,
            { id: user.id, username: user.username },
            reply,
            req,
          );
          fastify.log.info(
            {
              userId: logged.id,
            },
            'desktop_handoff_redeem_success',
          );
          return reply.code(200).send({ user: logged, csrfToken });
        } catch (err) {
          fastify.log.error(
            {
              err,
              hasCode: true,
            },
            'desktop_handoff_redeem_failed',
          );
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );
  });
}
