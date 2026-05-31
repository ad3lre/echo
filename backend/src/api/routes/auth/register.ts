import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
import { authSessionJsonBody } from '../../../auth/authSessionResponse';
import { updateCachedUserInAllSessions } from '../../../auth/serverSession';
import { getEmailVerifyRedirectUrl } from '../../../domain/emailVerificationUrls';
import {
  sendSignupVerificationEmail,
  sendSignupVerificationResend,
} from '../../../services/auth/emailVerificationActions';
import { requireAuth } from '../../../auth/middleware';
import type { AuthRegisterBody } from '../../../auth/types';
import { config } from '../../../config';
import { MIN_PASSWORD_LENGTH } from '../../../auth/accountPolicy';
import {
  authHwidAccountCapActive,
  countDistinctAccountsForHwidProfileAndIp,
  hashClientHwidForProfile,
  normalizeClientHwid,
  recordHwidProfileAccountBinding,
} from '../../../services/auth/hwidAccountProfile';
import { tryJoinOfficialEchoServerOnSignup } from '../../../services/auth/officialEchoServerOnSignup';
import { consumeSignupVerificationToken } from '../../../auth/verifyEmailFlow';

export default async function registerRoutes(fastify: FastifyInstance) {
  async function finishEmailVerification(
    reply: Parameters<typeof sendError>[0],
    token: string,
    opts?: { json?: boolean },
  ) {
    const { store } = await getAuthStore();
    const outcome = await consumeSignupVerificationToken(store, token);
    if (!outcome.ok) {
      if (outcome.reason === 'missing') {
        return sendError(
          reply,
          400,
          'INVALID_TOKEN',
          'Missing verification token',
        );
      }
      return sendError(
        reply,
        400,
        'INVALID_TOKEN',
        'Invalid or expired verification link',
      );
    }
    const updated = await store.getUserById(outcome.userId);
    if (updated) {
      await updateCachedUserInAllSessions(updated.id, updated);
    }
    if (opts?.json) {
      return reply.code(200).send({ ok: true });
    }
    return reply.code(302).redirect(getEmailVerifyRedirectUrl());
  }

  /**
   * Legacy email links hit the API with `?token=` (logged by proxies). Redirect to the SPA
   * fragment handoff without consuming the token; verification happens via POST.
   */
  fastify.get<{ Querystring: { token?: string; format?: string } }>(
    '/verify-email',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            format: { type: 'string', enum: ['json'] },
          },
        },
      },
    },
    async (req, reply) => {
      const token =
        typeof req.query.token === 'string' ? req.query.token.trim() : '';
      if (!token) {
        return sendError(
          reply,
          400,
          'INVALID_TOKEN',
          'Missing verification token',
        );
      }
      if (req.query.format === 'json') {
        try {
          return await finishEmailVerification(reply, token, { json: true });
        } catch (err) {
          fastify.log.error(err, 'verify_email_failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      }
      const appBase = config.echoAppPublicUrl.replace(/\/$/, '');
      return reply
        .code(302)
        .redirect(`${appBase}/verify-email#token=${encodeURIComponent(token)}`);
    },
  );

  await fastify.register(async (verifyEmailScope) => {
    await verifyEmailScope.register(rateLimit, {
      max: 20,
      timeWindow: '15 minutes',
      keyGenerator: (req) => `auth_verify_email:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });
    verifyEmailScope.post<{ Body: { token?: string } }>(
      '/verify-email',
      {
        schema: {
          body: {
            type: 'object',
            required: ['token'],
            properties: {
              token: { type: 'string', minLength: 10 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const token =
          typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        try {
          return await finishEmailVerification(reply, token, { json: true });
        } catch (err) {
          fastify.log.error(err, 'verify_email_post_failed');
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

  await fastify.register(async (registerScope) => {
    await registerScope.register(rateLimit, {
      max: 25,
      timeWindow: '1 hour',
      keyGenerator: (req) => `auth_register:${req.ip}`,
      addHeaders: { 'retry-after': true },
    });
    registerScope.post<{
      Body: AuthRegisterBody;
    }>(
      '/register',
      {
        schema: {
          body: {
            type: 'object',
            required: ['username', 'password', 'email'],
            properties: {
              username: { type: 'string', minLength: 1 },
              password: { type: 'string', minLength: MIN_PASSWORD_LENGTH },
              email: { type: 'string', minLength: 3, maxLength: 254 },
              displayName: { type: 'string' },
              clientHwid: { type: 'string', maxLength: 2048 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const body = req.body;
        try {
          const { store, mode } = await getAuthStore();
          const ip = req.ip;
          let normalizedHwidForCap: string | null = null;
          if (authHwidAccountCapActive()) {
            normalizedHwidForCap = normalizeClientHwid(body.clientHwid);
            if (!normalizedHwidForCap) {
              return sendError(
                reply,
                400,
                'HWID_REQUIRED',
                'This server requires a stable client device id to register. Update the app or send clientHwid (16+ characters).',
              );
            }
            const hwidHash = hashClientHwidForProfile(normalizedHwidForCap);
            const existingAccounts =
              await countDistinctAccountsForHwidProfileAndIp(hwidHash, ip);
            if (existingAccounts >= config.authHwidMaxAccountsPerHwidIp) {
              return sendError(
                reply,
                429,
                'ACCOUNT_LIMIT_HWID_IP',
                'Too many accounts from this device on this network. Use an existing account or try again later.',
              );
            }
          }
          const user = await store.createUser(body);
          const session = await issueEchoBrowserSession(
            store,
            user,
            reply,
            req,
          );
          if (
            mode === 'postgres' &&
            session.user.email &&
            !session.user.emailVerified
          ) {
            void sendSignupVerificationEmail(fastify.log, store, session.user);
          }
          if (normalizedHwidForCap) {
            await recordHwidProfileAccountBinding(
              session.user.id,
              normalizedHwidForCap,
              ip,
            );
          }
          void tryJoinOfficialEchoServerOnSignup(fastify.log, session.user.id, {
            joinClientIp: ip,
          });
          return reply.code(201).send(authSessionJsonBody(session));
        } catch (err: any) {
          if (err?.message === 'USERNAME_TAKEN') {
            return sendError(
              reply,
              409,
              'USERNAME_TAKEN',
              'Username is already in use',
            );
          }
          if (err?.message === 'INVALID_USERNAME') {
            return sendError(
              reply,
              400,
              'INVALID_USERNAME',
              'Username is invalid',
            );
          }
          if (err?.message === 'INVALID_EMAIL') {
            return sendError(
              reply,
              400,
              'INVALID_EMAIL',
              'Please enter a valid email address.',
            );
          }
          if (err?.message === 'INVALID_EMAIL_PROVIDER') {
            return sendError(
              reply,
              400,
              'INVALID_EMAIL_PROVIDER',
              'Temporary, disposable, or relay inbox domains cannot be used. Sign up with a normal email address you keep long term.',
            );
          }
          if (err?.message === 'EMAIL_IN_USE') {
            return sendError(
              reply,
              409,
              'EMAIL_IN_USE',
              'That email is already registered.',
            );
          }
          if (err?.message === 'INVALID_DISPLAY_NAME') {
            return sendError(
              reply,
              400,
              'INVALID_DISPLAY_NAME',
              'Display name is invalid.',
            );
          }
          if (err?.message === 'WEAK_PASSWORD') {
            return sendError(
              reply,
              400,
              'INVALID_BODY',
              `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
            );
          }
          fastify.log.error(err, 'Auth register failed');
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

  fastify.post(
    '/resend-verification',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      if (req.authUser.isGuest) {
        return sendError(
          reply,
          403,
          'GUEST',
          'Guest accounts cannot verify email this way.',
        );
      }
      if (!req.authUser.email) {
        return sendError(reply, 400, 'NO_EMAIL', 'No email address on file.');
      }
      if (req.authUser.emailVerified) {
        return sendError(
          reply,
          400,
          'ALREADY_VERIFIED',
          'Email is already verified.',
        );
      }
      try {
        const { store, mode } = await getAuthStore();
        if (mode !== 'postgres') {
          return sendError(
            reply,
            503,
            'NOT_AVAILABLE',
            'Email verification requires a database.',
          );
        }
        await sendSignupVerificationResend(fastify.log, store, req.authUser);
        return reply.code(204).send();
      } catch (err: any) {
        if (err?.message === 'VERIFICATION_EMAIL_COOLDOWN') {
          return sendError(
            reply,
            429,
            'VERIFICATION_EMAIL_COOLDOWN',
            'Please wait before requesting another verification email.',
          );
        }
        fastify.log.error(err, 'resend_verification_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );
}
