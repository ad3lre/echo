import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { httpRateLimitStoreOpts } from '../../../services/httpRateLimitStore';
import { sendError } from '../../errors';
import { verifyLoginEmailPendingToken } from '../../../auth/token';
import { getAuthStore } from '../../../auth/store';
import { clearGuestBindingCookie } from '../../../auth/sessionCookies';
import { issueEchoBrowserSession } from '../../../auth/issueBrowserSession';
import { authSessionJsonBody } from '../../../auth/authSessionResponse';
import { loginAuditDigests } from '../../../auth/loginAudit';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';
import {
  mfaLoginRouteRate,
  mfaLoginStrictRouteRate,
} from '../../meLinkRouteRateLimits';
import { continueAfterEmailIpOk } from '../../../services/auth/passwordLoginGates';
import {
  issueLoginEmailIpOtp,
  trustLoginIp,
  verifyLoginEmailIpOtp,
} from '../../../services/auth/loginTrustedIpStore';
import { sendSignupVerificationResend } from '../../../services/auth/emailVerificationActions';
import { config } from '../../../config';
import { sendTransactionalEmail } from '../../../services/email/sendMail';
import { buildNewIpLoginOtpEmailContent } from '../../../services/email/loginIpOtpTemplates';
import { maskEmailAddress } from '../../../services/auth/maskEmail';
import { replyIfInstanceBanned } from '../../../domain/instanceBanEnforcement';

type LoginEmailPendingBody = {
  loginToken?: string;
  code?: string;
  diagTraceId?: string;
};

export default async function loginEmailIpRoutes(fastify: FastifyInstance) {
  await fastify.register(async (emailLoginScope) => {
    const emailIdentityRateLimitKey = (req: FastifyRequest): string => {
      let token = '';
      if (req.body && typeof req.body === 'object') {
        const value = (req.body as { loginToken?: unknown }).loginToken;
        if (typeof value === 'string') {
          token = value.trim();
        }
      }
      return `email_login_identity:${clientIpFromFastifyRequest(req)}:${token || '__missing__'}`;
    };
    const mfaIpRate = mfaLoginRouteRate();
    await emailLoginScope.register(rateLimit, {
      max: mfaIpRate.max,
      timeWindow: mfaIpRate.timeWindow,
      keyGenerator: (req) =>
        `email_login_ip:${clientIpFromFastifyRequest(req)}`,
      addHeaders: { 'retry-after': true },
      ...httpRateLimitStoreOpts('echo-rl-auth-email-login-ip-'),
    });
    const mfaStrictRate = mfaLoginStrictRouteRate();
    await emailLoginScope.register(rateLimit, {
      max: mfaStrictRate.max,
      timeWindow: mfaStrictRate.timeWindow,
      keyGenerator: emailIdentityRateLimitKey,
      addHeaders: { 'retry-after': true },
      ...httpRateLimitStoreOpts('echo-rl-auth-email-login-id-'),
    });

    emailLoginScope.post<{ Body: LoginEmailPendingBody }>(
      '/login/resend-verification',
      {
        schema: {
          body: {
            type: 'object',
            required: ['loginToken'],
            properties: {
              loginToken: { type: 'string', minLength: 20 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const loginToken = String(req.body?.loginToken ?? '').trim();
        if (!loginToken) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'loginToken is required',
          );
        }
        try {
          let userId: string;
          try {
            userId = verifyLoginEmailPendingToken(loginToken).sub;
          } catch {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          const { store, mode } = await getAuthStore();
          if (mode !== 'postgres') {
            return sendError(
              reply,
              503,
              'NOT_AVAILABLE',
              'Email verification requires a database.',
            );
          }
          const user = await store.getUserById(userId);
          if (!user || user.isGuest || !user.email) {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          if (user.emailVerified) {
            return sendError(
              reply,
              400,
              'ALREADY_VERIFIED',
              'Email is already verified. Sign in again.',
            );
          }
          try {
            await sendSignupVerificationResend(fastify.log, store, user);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : undefined;
            if (msg === 'VERIFICATION_EMAIL_COOLDOWN') {
              return sendError(
                reply,
                429,
                'VERIFICATION_EMAIL_COOLDOWN',
                'Please wait before requesting another verification email.',
              );
            }
            throw err;
          }
          return reply.code(204).send();
        } catch (err) {
          fastify.log.error(err, 'Auth login resend verification failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    emailLoginScope.post<{ Body: LoginEmailPendingBody }>(
      '/login/email-ip-code',
      {
        schema: {
          body: {
            type: 'object',
            required: ['loginToken', 'code'],
            properties: {
              loginToken: { type: 'string', minLength: 20 },
              code: { type: 'string', minLength: 4, maxLength: 16 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const loginToken = String(req.body?.loginToken ?? '').trim();
        const codeRaw = String(req.body?.code ?? '').trim();
        if (!loginToken || !codeRaw) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'loginToken and code are required',
          );
        }
        try {
          const audit = loginAuditDigests(req);
          let userId: string;
          try {
            userId = verifyLoginEmailPendingToken(loginToken).sub;
          } catch {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          const { store } = await getAuthStore();
          const user = await store.getUserById(userId);
          if (!user || user.isGuest || !user.email) {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          if (!user.emailVerified) {
            return sendError(
              reply,
              403,
              'EMAIL_VERIFICATION_REQUIRED',
              'Verify your email before continuing.',
            );
          }
          const emailNorm = user.email.trim().toLowerCase();
          const ok = await verifyLoginEmailIpOtp({
            userId,
            emailNorm,
            ipDigest: audit.ipDigest,
            plainCode: codeRaw,
          });
          if (!ok) {
            void store.recordLoginEvent({
              userId,
              eventType: 'login_fail_email_ip_otp',
              ipDigest: audit.ipDigest,
              uaDigest: audit.uaDigest,
            });
            return sendError(
              reply,
              401,
              'INVALID_EMAIL_IP_CODE',
              'Invalid or expired verification code.',
            );
          }
          await trustLoginIp(userId, audit.ipDigest);
          clearGuestBindingCookie(reply);
          const next = continueAfterEmailIpOk(user);
          if (next.kind === 'mfa_required') {
            return reply.code(200).send({
              mfaRequired: true,
              mfaToken: next.mfaToken,
              user: next.user,
            });
          }
          void store.recordLoginEvent({
            userId,
            eventType: 'login_success_email_ip',
            ipDigest: audit.ipDigest,
            uaDigest: audit.uaDigest,
          });
          if (
            await replyIfInstanceBanned(reply, {
              userId,
              rawIp: clientIpFromFastifyRequest(req),
            })
          ) {
            return;
          }
          const session = await issueEchoBrowserSession(
            store,
            { id: user.id, username: user.username },
            reply,
            req,
          );
          return reply.code(200).send(authSessionJsonBody(session));
        } catch (err) {
          fastify.log.error(err, 'Auth login email-ip-code failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );

    emailLoginScope.post<{ Body: LoginEmailPendingBody }>(
      '/login/email-ip-resend',
      {
        schema: {
          body: {
            type: 'object',
            required: ['loginToken'],
            properties: {
              loginToken: { type: 'string', minLength: 20 },
              diagTraceId: { type: 'string', maxLength: 128 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        const loginToken = String(req.body?.loginToken ?? '').trim();
        if (!loginToken) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'loginToken is required',
          );
        }
        try {
          const audit = loginAuditDigests(req);
          let userId: string;
          try {
            userId = verifyLoginEmailPendingToken(loginToken).sub;
          } catch {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          const { store } = await getAuthStore();
          const user = await store.getUserById(userId);
          if (!user || user.isGuest || !user.email || !user.emailVerified) {
            return sendError(
              reply,
              401,
              'INVALID_LOGIN_TOKEN',
              'Sign-in step expired or invalid. Sign in again.',
            );
          }
          const emailNorm = user.email.trim().toLowerCase();
          try {
            const { plainCode } = await issueLoginEmailIpOtp({
              userId,
              emailNorm,
              ipDigest: audit.ipDigest,
              enforceResendCooldown: true,
            });
            const { subject, text, html } = buildNewIpLoginOtpEmailContent({
              username: user.username,
              code: plainCode,
              ttlMinutes: config.echoLoginEmailOtpTtlMinutes,
            });
            await sendTransactionalEmail(fastify.log, {
              to: user.email,
              subject,
              text,
              html,
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : undefined;
            if (msg === 'LOGIN_EMAIL_OTP_COOLDOWN') {
              return sendError(
                reply,
                429,
                'LOGIN_EMAIL_OTP_COOLDOWN',
                'Please wait before requesting another code.',
              );
            }
            throw err;
          }
          return reply.code(200).send({
            emailIpVerificationRequired: true,
            loginToken,
            maskedEmail: maskEmailAddress(user.email),
            user: { id: user.id, username: user.username },
          });
        } catch (err) {
          fastify.log.error(err, 'Auth login email-ip-resend failed');
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
