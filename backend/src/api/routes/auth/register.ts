import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../../errors';
import { getAuthStore } from '../../../auth/store';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
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

export default async function registerRoutes(fastify: FastifyInstance) {
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
      try {
        const { store } = await getAuthStore();
        const result = await store.consumeEmailVerificationToken(token);
        if (!result) {
          return sendError(
            reply,
            400,
            'INVALID_TOKEN',
            'Invalid or expired verification link',
          );
        }
        /** Session cache stores `emailVerified`; without this, verified users still look unverified on `/auth/me`. */
        const updated = await store.getUserById(result.userId);
        if (updated) {
          await updateCachedUserInAllSessions(updated.id, updated);
        }
        const wantJson =
          req.query.format === 'json' ||
          String(req.headers.accept ?? '').includes('application/json');
        if (wantJson) {
          return reply.code(200).send({ ok: true });
        }
        return reply.code(302).redirect(getEmailVerifyRedirectUrl());
      } catch (err) {
        fastify.log.error(err, 'verify_email_failed');
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    },
  );

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
          const { user: u, csrfToken } = await issueEchoBrowserSession(
            store,
            user,
            reply,
            req,
          );
          if (mode === 'postgres' && u.email && !u.emailVerified) {
            void sendSignupVerificationEmail(fastify.log, store, u);
          }
          if (normalizedHwidForCap) {
            await recordHwidProfileAccountBinding(
              u.id,
              normalizedHwidForCap,
              ip,
            );
          }
          return reply.code(201).send({ user: u, csrfToken });
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
          const detail =
            !config.isProduction && err instanceof Error
              ? err.message
              : undefined;
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
            detail,
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
