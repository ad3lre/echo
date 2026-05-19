import type { FastifyInstance } from 'fastify';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { requireAuth } from '../../../auth/middleware';

export default async function twoFactorRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/2fa/totp/begin',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Guest accounts cannot enable two-factor authentication.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Two-factor authentication requires a database.',
          );
        }
        const out = await store.beginTotpEnrollment(req.authUser.id);
        return reply.code(200).send(out);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'TOTP_ALREADY_ENABLED') {
          return sendError(
            reply,
            400,
            'TOTP_ALREADY_ENABLED',
            'Authenticator is already enabled.',
          );
        }
        if (msg === 'TOTP_NOT_ALLOWED') {
          return sendError(
            reply,
            403,
            'TOTP_NOT_ALLOWED',
            'Two-factor authentication is not available for this account.',
          );
        }
        if (msg === 'NOT_FOUND') {
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        fastify.log.error(err, 'totp_begin_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.post<{ Body: { code: string } }>(
    '/2fa/totp/confirm',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', minLength: 6, maxLength: 16 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Guest accounts cannot enable two-factor authentication.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Two-factor authentication requires a database.',
          );
        }
        const out = await store.confirmTotpEnrollment(
          req.authUser.id,
          req.body.code,
        );
        return reply.code(200).send(out);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'NO_PENDING_TOTP') {
          return sendError(
            reply,
            400,
            'NO_PENDING_TOTP',
            'Start enrollment first, then enter the code from your authenticator app.',
          );
        }
        if (msg === 'INVALID_TOTP') {
          return sendError(
            reply,
            400,
            'INVALID_TOTP',
            'That code is not valid. Check the clock on your device.',
          );
        }
        if (msg === 'TOTP_ALREADY_ENABLED') {
          return sendError(
            reply,
            400,
            'TOTP_ALREADY_ENABLED',
            'Authenticator is already enabled.',
          );
        }
        if (msg === 'NOT_FOUND') {
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        fastify.log.error(err, 'totp_confirm_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

  fastify.post<{
    Body: { password: string; code?: string; recoveryCode?: string };
  }>(
    '/2fa/totp/disable',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string', minLength: 1 },
            code: { type: 'string', minLength: 6, maxLength: 16 },
            recoveryCode: { type: 'string', minLength: 8, maxLength: 40 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Guest accounts cannot change two-factor authentication.',
        );
      }
      const code =
        req.body.code !== undefined ? String(req.body.code).trim() : '';
      const recoveryCode =
        req.body.recoveryCode !== undefined
          ? String(req.body.recoveryCode).trim()
          : '';
      if ((!code && !recoveryCode) || (code && recoveryCode)) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Provide exactly one of code (TOTP) or recoveryCode.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Two-factor authentication requires a database.',
          );
        }
        await store.disableTotp(req.authUser.id, req.body.password, {
          ...(code ? { totpCode: code } : {}),
          ...(recoveryCode ? { recoveryCode } : {}),
        });
        const user = await store.getUserById(req.authUser.id);
        return reply.code(200).send({ user });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'INVALID_PASSWORD') {
          return sendError(
            reply,
            401,
            'INVALID_CREDENTIALS',
            'Password is incorrect.',
          );
        }
        if (msg === 'INVALID_TOTP' || msg === 'INVALID_RECOVERY_CODE') {
          return sendError(
            reply,
            400,
            'INVALID_SECOND_FACTOR',
            'Authenticator or recovery code is not valid.',
          );
        }
        if (msg === 'TOTP_NOT_ENABLED') {
          return sendError(
            reply,
            400,
            'TOTP_NOT_ENABLED',
            'Authenticator is not enabled.',
          );
        }
        if (msg === 'INVALID_FACTOR') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Provide exactly one of code (TOTP) or recoveryCode.',
          );
        }
        if (msg === 'NOT_FOUND') {
          return sendError(reply, 404, 'NOT_FOUND', 'User not found');
        }
        fastify.log.error(err, 'totp_disable_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );
}
