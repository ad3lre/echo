import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { httpRateLimitStoreOpts } from '../../../services/httpRateLimitStore';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { requireAuth } from '../../../auth/middleware';
import { deleteAllServerSessionsForUser } from '../../../auth/serverSession';
import { clearBrowserSessionCookies } from '../../../auth/sessionCookies';
import { isValidEmailFormat } from '../../../auth/email';
import { loginAuditDigests } from '../../../auth/loginAudit';
import { sendPasswordResetEmail } from '../../../services/auth/passwordResetActions';
import { disconnectAllSocketsForAuthUser } from '../../../services/auth/socketSessionRevocation';
import { MIN_PASSWORD_LENGTH } from '../../../auth/accountPolicy';
import {
  assertStepUpTotpIfEnabled,
  sendStepUpTotpError,
} from '../../../auth/stepUpAuth';
import {
  authForgotPasswordRouteRate,
  authResetPasswordRouteRate,
} from '../../sharedMutationRateLimits';

export default async function passwordRoutes(fastify: FastifyInstance) {
  await fastify.register(async (forgotScope) => {
    const forgotRate = authForgotPasswordRouteRate();
    await forgotScope.register(rateLimit, {
      max: forgotRate.max,
      timeWindow: forgotRate.timeWindow,
      keyGenerator: (req) => `auth_forgot:${req.ip}`,
      addHeaders: { 'retry-after': true },
      ...httpRateLimitStoreOpts('echo-rl-auth-forgot-'),
    });
    forgotScope.post<{ Body: { email: string } }>(
      '/forgot-password',
      {
        schema: {
          body: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', minLength: 3, maxLength: 254 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const audit = loginAuditDigests(req);
        try {
          const { store } = await getAuthStore();
          void store.recordLoginEvent({
            userId: null,
            eventType: 'forgot_password_request',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          const email = String(req.body.email ?? '').trim();
          if (!isValidEmailFormat(email)) {
            return reply.code(200).send({
              ok: true,
              message:
                'If an account exists for that email, you will receive reset instructions.',
            });
          }
          const user = await store.findPasswordUserByEmail(email);
          if (user && !user.isGuest && user.email && user.emailVerified) {
            await sendPasswordResetEmail(fastify.log, store, {
              id: user.id,
              username: user.username,
              email: user.email,
            });
          }
          return reply.code(200).send({
            ok: true,
            message:
              'If an account exists for that email, you will receive reset instructions.',
          });
        } catch (err) {
          fastify.log.error(err, 'forgot_password_failed');
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

  await fastify.register(async (resetScope) => {
    const resetRate = authResetPasswordRouteRate();
    await resetScope.register(rateLimit, {
      max: resetRate.max,
      timeWindow: resetRate.timeWindow,
      keyGenerator: (req) => `auth_reset:${req.ip}`,
      addHeaders: { 'retry-after': true },
      ...httpRateLimitStoreOpts('echo-rl-auth-reset-'),
    });
    resetScope.post<{
      Body: { token: string; newPassword: string; totpCode?: string };
    }>(
      '/reset-password',
      {
        schema: {
          body: {
            type: 'object',
            required: ['token', 'newPassword'],
            properties: {
              token: { type: 'string', minLength: 10 },
              newPassword: { type: 'string', minLength: MIN_PASSWORD_LENGTH },
              totpCode: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const audit = loginAuditDigests(req);
        try {
          const { store } = await getAuthStore();
          const token = String(req.body.token ?? '').trim();
          const newPassword = String(req.body.newPassword ?? '');
          const out = await store.consumePasswordResetToken(
            token,
            newPassword,
            {
              totpCode: req.body.totpCode,
            },
          );
          if (!out.ok) {
            if (out.reason === 'weak_password') {
              return sendError(
                reply,
                400,
                'INVALID_BODY',
                `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
              );
            }
            if (out.reason === 'totp_required') {
              return sendError(
                reply,
                400,
                'TOTP_REQUIRED',
                'This account uses two-factor authentication. Include your authenticator code.',
              );
            }
            if (out.reason === 'bad_totp') {
              return sendError(
                reply,
                401,
                'INVALID_TOTP',
                'Invalid authenticator code.',
              );
            }
            return sendError(
              reply,
              400,
              'INVALID_TOKEN',
              'Reset link is invalid or has expired.',
            );
          }
          await deleteAllServerSessionsForUser(out.userId);
          await disconnectAllSocketsForAuthUser(
            fastify,
            out.userId,
            'password_reset',
          );
          clearBrowserSessionCookies(reply);
          void store.recordLoginEvent({
            userId: out.userId,
            eventType: 'password_reset_success',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          return reply.code(200).send({
            ok: true,
            message:
              'Your password was updated. You can sign in with your new password.',
          });
        } catch (err) {
          fastify.log.error(err, 'reset_password_failed');
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

  fastify.post<{ Body: { password: string } }>(
    '/verify-password',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: '15 minutes',
          keyGenerator: (req) =>
            req.authUser?.id
              ? `auth_verify_password_uid:${req.authUser.id}`
              : `auth_verify_password_ip:${req.ip}`,
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const userRecord = await store.getUserByUsername(req.authUser.username);
      if (!userRecord)
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');
      const ok = await store.verifyPassword(userRecord, req.body.password);
      if (!ok)
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Invalid password');
      return reply.code(200).send({ ok: true });
    },
  );

  fastify.post<{
    Body: { currentPassword: string; newPassword: string; totpCode?: string };
  }>(
    '/change-password',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: MIN_PASSWORD_LENGTH },
            totpCode: { type: 'string', minLength: 6, maxLength: 16 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const userRecord = await store.getUserByUsername(req.authUser.username);
      if (!userRecord)
        return sendError(reply, 404, 'NOT_FOUND', 'User not found');

      const ok = await store.verifyPassword(
        userRecord,
        req.body.currentPassword,
      );
      if (!ok)
        return sendError(
          reply,
          401,
          'INVALID_CREDENTIALS',
          'Current password is incorrect',
        );

      const stepUp = await assertStepUpTotpIfEnabled(
        store,
        req.authUser.id,
        req.body.totpCode,
      );
      if (!stepUp.ok) return sendStepUpTotpError(reply, stepUp.reason);

      try {
        await store.updatePassword(req.authUser.id, req.body.newPassword);
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'WEAK_PASSWORD') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
          );
        }
        throw e;
      }
      await store.revokeUserRefreshTokens(req.authUser.id);
      await deleteAllServerSessionsForUser(req.authUser.id);
      await disconnectAllSocketsForAuthUser(
        fastify,
        req.authUser.id,
        'password_changed',
      );
      clearBrowserSessionCookies(reply);
      return reply.code(200).send({
        success: true,
        message: 'Password updated. Please log in again.',
      });
    },
  );
}
